const express = require('express')
const path = require('path')
const { ObjectId, MongoError } = require('mongodb')
const { connectDatabase } = require('./db')
const { setupAuth, validateSessionSecret } = require('./auth')
const port = 3000

function getStatus(currHp, maxHp) {
  if (currHp <= 0) {
    return 'Dead'
  } else if (currHp <= maxHp / 2) {
    return 'Bloodied'
  }

  return 'Alive'
}

function invalidInput(message) {
  return Object.assign(new Error(message), { status: 400 })
}

function parseNumber(value, label) {
  if (
    !['string', 'number'].includes(typeof value) ||
    String(value).trim() === '' ||
    !Number.isFinite(Number(value))
  ) {
    throw invalidInput(`${label} must be a valid number.`)
  }
  return Number(value)
}

function parseId(id) {
  if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) {
    throw invalidInput('Invalid character ID.')
  }
  return new ObjectId(id)
}

function parseCharacter(data) {
  const name = String(data.name || '').trim()
  const characterClass = String(data.class || '').trim()
  const species = String(data.species || '').trim()
  const level = parseNumber(data.level, 'Level')
  const currHp = parseNumber(data.currHp, 'Current HP')
  const maxHp = parseNumber(data.maxHp, 'Maximum HP')

  if (!name || !characterClass || !species) {
    throw invalidInput('Name, class, and species are required.')
  }

  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw invalidInput('Level must be an int from 1 to 20.')
  }

  if (!Number.isFinite(currHp) || !Number.isFinite(maxHp) || maxHp < 1) {
    throw invalidInput('Current HP and max HP must be valid numbers.')
  }

  if (currHp < 0 || currHp > maxHp) {
    throw invalidInput('Current HP must be between 0 and max HP.')
  }

  return {
    name,
    class: characterClass,
    species,
    level,
    currHp,
    maxHp
  }
}

function createApp(db, authOptions) {
  const app = express()
  const characters = db.collection('characters')

  async function listCharacters(ownerId) {
    const records = await characters.find({ ownerId }).sort({ _id: 1 }).toArray()
    return records.map(({ _id, name, class: characterClass, species, level, currHp, maxHp }) => ({
      id: _id.toHexString(),
      name,
      class: characterClass,
      species,
      level,
      currHp,
      maxHp,
      status: getStatus(currHp, maxHp)
    }))
  }

  app.use(express.json({ limit: '16kb' }))
  const { requireUser, requireCsrf } = setupAuth(app, db, authOptions)
  app.use(
    ['/data', '/add', '/update', '/delete', '/hp'],
    requireUser,
    (request, response, next) => {
      response.set('Cache-Control', 'no-store')
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method))
        return requireCsrf(request, response, next)
      next()
    }
  )

  function requireJsonObject(request, response, next) {
    if (!request.is('application/json')) {
      return response.status(415).json({ error: 'Content-Type must be application/json.' })
    }

    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
      return response.status(400).json({ error: 'Request body must be a JSON object.' })
    }

    next()
  }

  app.get('/data', async (request, response) => {
    response.json(await listCharacters(request.user._id))
  })

  app.post('/add', requireJsonObject, async (request, response) => {
    await characters.insertOne({ ...parseCharacter(request.body), ownerId: request.user._id })
    response.json(await listCharacters(request.user._id))
  })

  app.post('/update', requireJsonObject, async (request, response) => {
    const _id = parseId(request.body.id)
    const fields = parseCharacter(request.body)
    const result = await characters.updateOne({ _id, ownerId: request.user._id }, { $set: fields })
    if (result.matchedCount === 0) {
      return response.status(404).json({ error: 'Character not found.' })
    }

    response.json(await listCharacters(request.user._id))
  })

  app.post('/delete', requireJsonObject, async (request, response) => {
    const result = await characters.deleteOne({
      _id: parseId(request.body.id),
      ownerId: request.user._id
    })
    if (result.deletedCount === 0) {
      return response.status(404).json({ error: 'Character not found.' })
    }

    response.json(await listCharacters(request.user._id))
  })

  app.post('/hp', requireJsonObject, async (request, response) => {
    const _id = parseId(request.body.id)
    const amount = parseNumber(request.body.amount, 'HP amount')
    const result = await characters.updateOne({ _id, ownerId: request.user._id }, [
      {
        $set: { currHp: { $max: [0, { $min: ['$maxHp', { $add: ['$currHp', amount] }] }] } }
      }
    ])
    if (result.matchedCount === 0) {
      return response.status(404).json({ error: 'Character not found.' })
    }
    response.json(await listCharacters(request.user._id))
  })

  app.all(['/data', '/add', '/update', '/delete', '/hp'], (request, response) => {
    response.status(405).json({ error: 'Method not allowed.' })
  })

  app.get('/css/bootstrap.min.css', (request, response) => {
    response.sendFile(require.resolve('bootstrap/dist/css/bootstrap.min.css'))
  })
  app.use(express.static(path.join(__dirname, 'dist')))

  app.use((request, response) => {
    if (
      (request.method !== 'GET' && request.method !== 'HEAD') ||
      request.path === '/api' ||
      request.path.startsWith('/api/') ||
      request.path.startsWith('/auth/') ||
      request.is('application/json') ||
      request.get('accept')?.includes('application/json')
    ) {
      return response.status(404).json({ error: 'API endpoint not found.' })
    }
    response.status(404).type('text').send('404 Error: File Not Found')
  })

  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error)

    if (error.type === 'entity.parse.failed') {
      return response.status(400).json({ error: 'Invalid JSON.' })
    }
    if (error.type === 'entity.too.large') {
      return response.status(413).json({ error: 'Request body exceeds the 16 KB limit.' })
    }

    if (error instanceof MongoError) {
      return response.status(503).json({ error: 'Database unavailable. Please try again shortly.' })
    }

    const status = error.status >= 400 && error.status < 500 ? error.status : 500
    response.status(status).json({
      error:
        status === 500
          ? 'Internal server error.'
          : status === 400
            ? error.message
            : 'Invalid request.'
    })
  })

  return app
}

async function startServer() {
  validateSessionSecret(process.env.SESSION_SECRET)
  const { client, db } = await connectDatabase()
  const app = createApp(db)
  let server
  try {
    server = app.listen(process.env.PORT || port)
  } catch {
    await client.close()
    throw new Error('Unable to start HTTP server. Check that PORT is valid and available.')
  }
  server.on('error', async () => {
    console.error('Unable to start HTTP server. Check that PORT is valid and available.')
    await client.close()
    process.exitCode = 1
  })
  
  let stopping = false
  const shutdown = () => {
    if (stopping) return
    stopping = true
    const timeout = setTimeout(() => process.exit(1), 10000)
    timeout.unref()
    server.close(async () => {
      await client.close()
      clearTimeout(timeout)
    })
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = { createApp }
