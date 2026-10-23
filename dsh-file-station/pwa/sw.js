/* 最小 Service Worker：只是为了满足「可安装」条件。
 * 不做任何缓存：文件传输台的数据必须实时，旧页面/旧列表比离线壳更危险。 */
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', () => { /* 不调用 respondWith，请求照常走网络 */ });
