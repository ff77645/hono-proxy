import { Hono } from 'hono'

const app = new Hono()

// 定义缓存存储
const cache = caches.default

app.get('/', (c) => c.json({
	url:c.req.url
}))


// 代理并缓存请求
app.all('/proxy/*', async (c) => {
  // 从 URL 路径中获取目标地址
  const targetUrl = c.req.url.replace(c.req.url.split('/proxy/')[0] + '/proxy/', '')

	if (c.req.method === 'GET') {
		// 检查缓存是否已有响应
		const parsedUrl = new URL(targetUrl)
		const cacheKey = new Request(parsedUrl.origin + parsedUrl.pathname)
		const cachedResponse = await cache.match(cacheKey)
		if (cachedResponse) {
			// 记录读取缓存次数
			const kv = c.env.kvdb
			const _key = `cached_${parsedUrl.pathname.replace(/\//g,'_')}`
			const proxyTime = await kv.get(_key) || '0'
			const newProxyTime = parseInt(proxyTime) + 1
			await kv.put(_key, newProxyTime.toString())
			// 如果缓存命中，返回缓存的响应
			return cachedResponse
		}
	}

  try {
    // 向目标地址发起请求
    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers: c.req.headers,
      body: c.req.body,
    })

	// 如果是 GET 请求，克隆响应，保存一份到缓存中
		if (c.req.method === 'GET') {
			const parsedUrl = new URL(targetUrl)
			const cacheKey = new Request(parsedUrl.origin + parsedUrl.pathname)
      const responseClone = response.clone()
      await cache.put(cacheKey, responseClone)

			// 记录代理次数
			const kv = c.env.kvdb
			const _key = `proxy_${parsedUrl.pathname.replace(/\//g,'_')}`
			const proxyTime = await kv.get(_key) || '0'
			const newProxyTime = parseInt(proxyTime) + 1
			await kv.put(_key, newProxyTime.toString())
    }

    // 返回目标地址的响应
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    })
  } catch (error) {
    return c.text('Failed to proxy request', 500)
  }
})

// 清除指定路径的缓存
app.delete('/cache-clear', async (c) => {
  const targetUrl = c.req.query('url')

  if (!targetUrl) {
    return c.text('Please provide a valid URL to clear from cache', 400)
  }

  try {
    // 构造对应路径的缓存请求对象
		const parsedUrl = new URL(targetUrl)
		const cacheKey = new Request(parsedUrl.origin + parsedUrl.pathname)
    // 删除缓存中与该路径匹配的项
    const cacheDeleted = await cache.delete(cacheKey)
    if (cacheDeleted) {
      return c.text(`Cache for ${targetUrl} cleared successfully`, 200)
    } else {
      return c.text(`No cache found for ${targetUrl}`, 404)
    }
  } catch (error) {
    return c.text('Failed to clear cache', 500)
  }
})

// 默认路由，处理所有未匹配的请求
app.all('*', (c) => c.text('Route not found', 404))

export default app
