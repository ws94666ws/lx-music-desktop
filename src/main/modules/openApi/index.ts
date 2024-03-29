import http from 'node:http'
import type { Socket } from 'node:net'

let status: LX.OpenAPI.Status = {
  status: false,
  message: '',
  address: '',
}

let httpServer: http.Server
let sockets = new Set<Socket>()
let responses = new Set<http.ServerResponse<http.IncomingMessage>>()

const handleStartServer = async(port = 9000, ip = '127.0.0.1') => new Promise<void>((resolve, reject) => {
  httpServer = http.createServer((req, res) => {
    // console.log(req.url)
    const endUrl = `/${req.url?.split('/').at(-1) ?? ''}`
    let code
    let msg
    switch (endUrl) {
      case '/status':
        code = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        msg = JSON.stringify({
          status: global.lx.player_status.status,
          name: global.lx.player_status.name,
          singer: global.lx.player_status.singer,
          albumName: global.lx.player_status.albumName,
          duration: global.lx.player_status.duration,
          progress: global.lx.player_status.progress,
          picUrl: global.lx.player_status.picUrl,
          playbackRate: global.lx.player_status.playbackRate,
          lyricLineText: global.lx.player_status.lyricLineText,
        })
        break
        // case '/test':
        //   code = 200
        //   res.setHeader('Content-Type', 'text/html; charset=utf-8')
        //   msg = `<!DOCTYPE html>
        //   <html lang="en">
        //     <head>
        //       <meta charset="UTF-8" />
        //       <meta http-equiv="X-UA-Compatible" content="IE=edge" />
        //       <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        //       <title>Nodejs Server-Sent Events</title>
        //     </head>
        //     <body>
        //       <h1>Hello SSE!</h1>

        //       <h2>List of Server-sent events</h2>
        //       <ul id="sse-list"></ul>

        //       <script>
        //         const subscription = new EventSource('/subscribe-player-status');

        //       // Default events
        //       subscription.addEventListener('open', () => {
        //           console.log('Connection opened')
        //       });

      //       subscription.addEventListener('error', (err) => {
      //           console.error(err)
      //       });
      //       subscription.addEventListener('lyricLineText', (event) => {
      //           console.log(event.data)
      //       });
      //       subscription.addEventListener('progress', (event) => {
      //           console.log(event.data)
      //       });
      //       subscription.addEventListener('name', (event) => {
      //           console.log(event.data)
      //       });
      //       subscription.addEventListener('singer', (event) => {
      //           console.log(event.data)
      //       });
      //       </script>
      //     </body>
      //   </html>`
      //   break
      case '/lyric':
        code = 200
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        msg = global.lx.player_status.lyric
        break
      case '/subscribe-player-status':
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          Connection: 'keep-alive',
          'Cache-Control': 'no-cache',
        })
        req.socket.setTimeout(0)
        req.on('close', () => {
          res.end('OK')
          responses.delete(res)
        })
        for (const [k, v] of Object.entries(global.lx.player_status)) {
          res.write(`event: ${k}\n`)
          res.write(`data: ${JSON.stringify(v)}\n\n`)
        }
        responses.add(res)
        return
      default:
        code = 401
        msg = 'Forbidden'
        break
    }
    if (!code) return
    res.writeHead(code)
    res.end(msg)
  })
  httpServer.on('error', error => {
    console.log(error)
    reject(error)
  })
  httpServer.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => {
      sockets.delete(socket)
    })
    socket.setTimeout(4000)
  })

  httpServer.on('listening', () => {
    const addr = httpServer.address()
    // console.log(addr)
    if (!addr) {
      reject(new Error('address is null'))
      return
    }
    resolve()
  })
  httpServer.listen(port, ip)
})

const handleStopServer = async() => new Promise<void>((resolve, reject) => {
  if (!httpServer) return
  httpServer.close((err) => {
    if (err) {
      reject(err)
      return
    }
    resolve()
  })
  for (const socket of sockets) socket.destroy()
  sockets.clear()
  responses.clear()
})


const sendStatus = (status: Partial<LX.Player.Status>) => {
  if (!responses.size) return
  for (const [k, v] of Object.entries(status)) {
    for (const resp of responses) {
      resp.write(`event: ${k}\n`)
      resp.write(`data: ${JSON.stringify(v)}\n\n`)
    }
  }
}
export const stopServer = async() => {
  global.lx.event_app.off('player_status', sendStatus)
  if (!status.status) {
    status.status = false
    status.message = ''
    status.address = ''
    return status
  }
  await handleStopServer().then(() => {
    status.status = false
    status.message = ''
    status.address = ''
  }).catch(err => {
    console.log(err)
    status.message = err.message
  })
  return status
}
export const startServer = async(port: number) => {
  if (status.status) await handleStopServer()
  await handleStartServer(port).then(() => {
    status.status = true
    status.message = ''
    status.address = `http://localhost${port == 80 ? '' : ':' + port}`
  }).catch(err => {
    console.log(err)
    status.status = false
    status.message = err.message
    status.address = ''
  })
  global.lx.event_app.on('player_status', sendStatus)
  return status
}

export const getStatus = (): LX.OpenAPI.Status => status
