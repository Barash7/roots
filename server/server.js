import express from 'express'
import path from 'path'
import cors from 'cors'
import sockjs from 'sockjs'
import { renderToStaticNodeStream } from 'react-dom/server'
import React from 'react'
import axios from 'axios'

import cookieParser from 'cookie-parser'
import config from './config'
import Html from '../client/html'

const { readFile, writeFile, unlink } = require('fs').promises

require('colors')

let Root
try {
  // eslint-disable-next-line import/no-unresolved
  Root = require('../dist/assets/js/ssr/root.bundle').default
} catch {
  console.log('SSR not found. Please run "yarn run build:ssr"'.red)
}

let connections = []

const port = process.env.PORT || 8090
const server = express()

const setHeader = (req, res, next) => {
  res.set('x-skillcrucial-user', 'b079287f-8613-490c-aa4c-82e2457051af')
  res.set('Access-Control-Expose-Headers', 'X-SKILLCRUCIAL-USER')
  next()
}

const middleware = [
  cors(),
  express.static(path.resolve(__dirname, '../dist/assets')),
  express.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }),
  express.json({ limit: '50mb', extended: true }),
  cookieParser(),
  setHeader
]

middleware.forEach((it) => server.use(it))

const globalUrl = 'https://jsonplaceholder.typicode.com/users'
const globalPath = `${__dirname}/data/users.json`

const getData = (url) => {
  const usersList = axios(url)
    .then(({ data }) => data)
    .catch((err) => {
      console.log(err)
      return []
    })
  return usersList
}

server.get('/api/v1/users', async (req, res) => {
  const userList = await readFile(globalPath, 'utf-8')
    .then((usersData) => {
      return JSON.parse(usersData)
    })
    .catch(async (err) => {
      console.log(err)
      const recivedData = await getData(globalUrl)
      await writeFile(globalPath, JSON.stringify(recivedData), 'utf-8')
      return recivedData
    })
  res.json(userList)
})

server.delete('/api/v1/users', (req, res) => {
  unlink(globalPath)
    .then(() => {
      res.json({ status: 'File deleted' })
    })
    .catch((err) => {
      console.log('Error: ', err)
      res.json({ status: 'No file' })
    })
})

server.post('/api/v1/users', async (req, res) => {
  const usersList = await readFile(globalPath, 'utf-8')
    .then(async (strUsers) => {
      const parsedStr = JSON.parse(strUsers)
      const lastId = parsedStr[parsedStr.length - 1].id + 1
      await writeFile(
        globalPath,
        JSON.stringify([...parsedStr, { ...req.body, id: lastId }]),
        'utf-8'
      )
      return { status: 'success', id: lastId }
    })
    .catch(async (err) => {
      console.log(err)
      await writeFile(globalPath, JSON.stringify([{ ...req.body, id: 1 }]), 'utf-8')
      return { status: 'success', id: 1 }
    })
  res.json(usersList)
})

server.use('/api/', (req, res) => {
  res.status(404)
  res.end()
})

const [htmlStart, htmlEnd] = Html({
  body: 'separator',
  title: 'Skillcrucial'
}).split('separator')

server.get('/', (req, res) => {
  const appStream = renderToStaticNodeStream(<Root location={req.url} context={{}} />)
  res.write(htmlStart)
  appStream.pipe(res, { end: false })
  appStream.on('end', () => {
    res.write(htmlEnd)
    res.end()
  })
})

server.get('/*', (req, res) => {
  const appStream = renderToStaticNodeStream(<Root location={req.url} context={{}} />)
  res.write(htmlStart)
  appStream.pipe(res, { end: false })
  appStream.on('end', () => {
    res.write(htmlEnd)
    res.end()
  })
})

const app = server.listen(port)

if (config.isSocketsEnabled) {
  const echo = sockjs.createServer()
  echo.on('connection', (conn) => {
    connections.push(conn)
    conn.on('data', async () => {})

    conn.on('close', () => {
      connections = connections.filter((c) => c.readyState !== 3)
    })
  })
  echo.installHandlers(app, { prefix: '/ws' })
}
console.log(`Serving at http://localhost:${port}`)
