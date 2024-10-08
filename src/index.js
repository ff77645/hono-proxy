import { Hono } from 'hono'

const app = new Hono()

// 定义缓存存储

app.get('/', (c) => c.json({
  url:c.req.url
}))

const cache = caches.default

app.get('/proxy/*',async (c)=>{
  const targetUrl = c.req.url.replace(c.req.url.split('/proxy/')[0] + '/proxy/', '')
  const {origin,pathname} = new URL(targetUrl)
  const cacheKey = new Request(origin+pathname)
  console.log('cacheKey',cacheKey.url,cacheKey.method);
  
  const cachedResponse = await cache.match(cacheKey) 
  
  if(cachedResponse) {
    console.log('读取缓存: ',targetUrl);
    return new Response(cachedResponse.body,{
      status: cachedResponse.status,
      headers: {
        ...cachedResponse.headers,
        'use-cache':'true'
      },
    })
  }
  
  // 向目标地址发起请求
  const response = await fetch(targetUrl, {
    method: c.req.method,
    headers: c.req.headers,
    body: c.req.body,
  })

  // 缓存响应
  const res = new Response(response.body, {
    status: response.status,
    // headers: response.headers,
  })

  console.log('写入缓存: ',targetUrl);
  await cache.put(cacheKey, res.clone())
  
  return res
})


// 清除指定路径的缓存
app.delete('/cache-clear', async (c) => {
  const targetUrl = c.req.query('url')

  if (!targetUrl) {
    return c.text('Please provide a valid URL to clear from cache', 400)
  }

  try {
    // 构造对应路径的缓存请求对象
		const {origin,pathname} = new URL(targetUrl)
		const cacheKey = new Request(origin+pathname)
    console.log('cacheKey',cacheKey.url,cacheKey.method);
    // 删除缓存中与该路径匹配的项
    const cacheDeleted = await cache.delete(cacheKey)
    console.log('清除缓存: ',targetUrl,cacheDeleted);
    
    if (cacheDeleted) {
      return c.text(`Cache for [${targetUrl}] cleared successfully`, 200)
    } else {
      return c.text(`No cache found for [${targetUrl}]`, 404)
    }
  } catch (error) {
    return c.text('Failed to clear cache', 500)
  }
})


// 代理并缓存请求
app.all('/proxy/*', async (c) => {
  const targetUrl = c.req.url.replace(c.req.url.split('/proxy/')[0] + '/proxy/', '')
  try {
    // 向目标地址发起请求
    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers: c.req.headers,
      body: c.req.body,
    })

    // 返回目标地址的响应
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    })
  } catch (error) {
    console.error('请求失败: ',c.req.method,targetUrl)
    return c.text('Failed to proxy request', 500)
  }
})


// 默认路由，处理所有未匹配的请求
app.all('*', (c) => c.text('Route not found', 404))

export default app
