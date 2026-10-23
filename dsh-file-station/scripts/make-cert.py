"""生成本地 HTTPS 证书（自签 CA + 服务器证书），供手机端 PWA 使用。

用法：
    python scripts/make-cert.py [额外的IP或域名 ...]

- 首次运行生成 CA（certs/ca.key.pem / ca.crt.pem），之后复用；手机只需安装一次 ca.crt。
- 每次运行重新签发服务器证书（certs/server.key.pem / server.crt.pem），
  自动包含本机局域网 IP、127.0.0.1、localhost 和主机名；IP 变了重跑即可，手机不用重装 CA。
- 私钥只留在本机，certs/ 已加入 .gitignore。
"""
import datetime
import ipaddress
import os
import socket
import sys

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CERT_DIR = os.path.join(ROOT, "certs")
CA_KEY = os.path.join(CERT_DIR, "ca.key.pem")
CA_CRT = os.path.join(CERT_DIR, "ca.crt.pem")
SRV_KEY = os.path.join(CERT_DIR, "server.key.pem")
SRV_CRT = os.path.join(CERT_DIR, "server.crt.pem")


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("223.5.5.5", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


def write_private(path, key):
    with open(path, "wb") as f:
        f.write(key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ))
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def load_ca():
    if os.path.exists(CA_KEY) and os.path.exists(CA_CRT):
        with open(CA_KEY, "rb") as f:
            key = serialization.load_pem_private_key(f.read(), None)
        with open(CA_CRT, "rb") as f:
            cert = x509.load_pem_x509_certificate(f.read())
        return key, cert
    key = ec.generate_private_key(ec.SECP256R1())
    now = datetime.datetime.now(datetime.timezone.utc)
    name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "DSH File Station Local CA"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "DSH File Station (local)"),
    ])
    cert = (
        x509.CertificateBuilder()
        .subject_name(name).issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(minutes=5))
        .not_valid_after(now + datetime.timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
        .add_extension(x509.KeyUsage(
            digital_signature=True, content_commitment=False, key_encipherment=False,
            data_encipherment=False, key_agreement=False, key_cert_sign=True,
            crl_sign=True, encipher_only=False, decipher_only=False,
        ), critical=True)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
        .sign(key, hashes.SHA256())
    )
    os.makedirs(CERT_DIR, exist_ok=True)
    write_private(CA_KEY, key)
    with open(CA_CRT, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    print("new CA ->", CA_CRT)
    return key, cert


def make_leaf(ca_key, ca_cert, extra_names):
    ip = lan_ip()
    host = socket.gethostname().split(".")[0]
    names = {ip, "127.0.0.1", "::1"}
    dns = {"localhost", host, host + ".local"}
    for raw in extra_names:
        try:
            names.add(str(ipaddress.ip_address(raw)))
        except ValueError:
            dns.add(raw)

    san = [x509.DNSName(n) for n in sorted(dns)]
    san += [x509.IPAddress(ipaddress.ip_address(n)) for n in sorted(names)]

    key = ec.generate_private_key(ec.SECP256R1())
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, ip),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "DSH File Station (local)"),
        ]))
        .issuer_name(ca_cert.subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(minutes=5))
        .not_valid_after(now + datetime.timedelta(days=825))
        .add_extension(x509.SubjectAlternativeName(san), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.KeyUsage(
            digital_signature=True, content_commitment=False, key_encipherment=True,
            data_encipherment=False, key_agreement=False, key_cert_sign=False,
            crl_sign=False, encipher_only=False, decipher_only=False,
        ), critical=True)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
        .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
        .sign(ca_key, hashes.SHA256())
    )
    write_private(SRV_KEY, key)
    with open(SRV_CRT, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    print("leaf ->", SRV_CRT)
    print("SAN:", ", ".join(sorted(dns | names)))
    print("phone CA:", CA_CRT)


def main():
    os.makedirs(CERT_DIR, exist_ok=True)
    ca_key, ca_cert = load_ca()
    make_leaf(ca_key, ca_cert, sys.argv[1:])


if __name__ == "__main__":
    main()
