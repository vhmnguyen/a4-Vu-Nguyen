const session = require('express-session')
const { MongoStore } = require('connect-mongo')
const bcrypt = require('bcryptjs')
const { ObjectId } = require('mongodb')
const { randomBytes, timingSafeEqual, createHash } = require('node:crypto')

function validateSessionSecret(secret) {
  if (
    typeof secret !== 'string' ||
    secret.length < 32 ||
    secret === 'replace-with-a-long-random-secret'
  ) {
    throw new Error('Set SESSION_SECRET to a random secret of at least 32 characters in .env.')
  }
}

function setupAuth(
  app,
  db,
  {
    secret = process.env.SESSION_SECRET,
    store,
    production = process.env.NODE_ENV === 'production'
  } = {}
) {
  validateSessionSecret(secret)
  if (production) app.set('trust proxy', 1)
  const cookie = { httpOnly: true, sameSite: 'lax', secure: production, path: '/' }
  app.use(
    session({
      name: 'party.sid',
      secret,
      store:
        store ||
        MongoStore.create({ client: db.client, dbName: db.databaseName, autoRemove: 'disabled' }),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: { ...cookie, maxAge: 8 * 60 * 60 * 1000 }
    })
  )

  const users = db.collection('users')
  const publicUser = (user) => ({
    id: user._id.toHexString(),
    username: user.username,
    createdAt: user.createdAt
  })
  const sessionCall = (request, method) =>
    new Promise((resolve, reject) => {
      request.session[method]((error) => (error ? reject(error) : resolve()))
    })
  const token = () => randomBytes(32).toString('hex')

  async function requireUser(request, response, next) {
    const id = request.session.userId
    if (!id || !ObjectId.isValid(id)) return response.status(401).json({ error: 'Please log in.' })
    const user = await users.findOne(
      { _id: new ObjectId(id) },
      { projection: { username: 1, createdAt: 1 } }
    )
    if (!user) return response.status(401).json({ error: 'Please log in.' })
    request.user = user
    next()
  }

  function requireCsrf(request, response, next) {
    const supplied = request.get('X-CSRF-Token') || ''
    const expected = request.session.csrfToken || ''
    if (
      !expected ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      return response
        .status(403)
        .json({ error: 'Invalid CSRF token. Refresh your session and try again.' })
    }
    next()
  }

  // Fixed 15-minute windows, persisted so restarting the server does not reset limits.
  async function limitCredentials(request, response, next) {
    const windowMs = 15 * 60 * 1000
    const window = Math.floor(Date.now() / windowMs)
    const ipHash = createHash('sha256').update(request.ip).digest('hex')
    const _id = `${ipHash}:${window}`
    const limits = db.collection('authAttempts')
    let result
    try {
      result = await limits.findOneAndUpdate(
        { _id },
        {
          $inc: { count: 1 },
          $setOnInsert: { expires: new Date((window + 1) * windowMs) }
        },
        { upsert: true, returnDocument: 'after' }
      )
    } catch (error) {
      if (error.code !== 11000) throw error
      result = await limits.findOneAndUpdate(
        { _id },
        { $inc: { count: 1 } },
        { returnDocument: 'after' }
      )
    }
    if (result.count > 30) {
      response.set('Retry-After', String(Math.ceil(((window + 1) * windowMs - Date.now()) / 1000)))
      return response
        .status(429)
        .json({ error: 'Too many authentication attempts. Try again later.' })
    }
    next()
  }

  function credentials(body) {
    const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : ''
    const password = body?.password
    if (
      !/^[a-z0-9_]{3,32}$/.test(username) ||
      typeof password !== 'string' ||
      password.length < 8 ||
      Buffer.byteLength(password, 'utf8') > 72
    ) {
      throw Object.assign(
        new Error(
          'Use a username of 3–32 letters, numbers, or underscores and a password of at least 8 characters (maximum 72 UTF-8 bytes).'
        ),
        { status: 400 }
      )
    }
    return { username, password }
  }

  async function signIn(request, user) {
    await sessionCall(request, 'regenerate')
    request.session.userId = user._id.toHexString()
    request.session.csrfToken = token()
    await sessionCall(request, 'save')
    return { user: publicUser(user), csrfToken: request.session.csrfToken }
  }

  app.use('/auth', (request, response, next) => {
    response.set('Cache-Control', 'no-store')
    next()
  })

  app.get('/auth/csrf', async (request, response) => {
    if (!request.session.csrfToken) request.session.csrfToken = token()
    await sessionCall(request, 'save')
    response.json({ csrfToken: request.session.csrfToken })
  })

  app.post('/auth/register', requireCsrf, limitCredentials, async (request, response) => {
    const { username, password } = credentials(request.body)
    const user = { username, passwordHash: await bcrypt.hash(password, 12), createdAt: new Date() }
    try {
      await users.insertOne(user)
    } catch (error) {
      if (error.code === 11000)
        return response.status(409).json({ error: 'Username already exists.' })
      throw error
    }
    response.status(201).json(await signIn(request, user))
  })

  app.post('/auth/login', requireCsrf, limitCredentials, async (request, response) => {
    const { username, password } = credentials(request.body)
    const user = await users.findOne({ username })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return response.status(401).json({ error: 'Invalid username or password.' })
    }
    response.json(await signIn(request, user))
  })

  app.get('/auth/me', requireUser, (request, response) => {
    response.json({ user: publicUser(request.user), csrfToken: request.session.csrfToken })
  })

  app.post('/auth/logout', requireUser, requireCsrf, async (request, response) => {
    await sessionCall(request, 'destroy')
    response.clearCookie('party.sid', cookie)
    response.json({ message: 'Logged out.' })
  })
  
  app.all(
    ['/auth/csrf', '/auth/register', '/auth/login', '/auth/me', '/auth/logout'],
    (request, response) => {
      response.status(405).json({ error: 'Method not allowed.' })
    }
  )
  return { requireUser, requireCsrf }
}

module.exports = { setupAuth, validateSessionSecret }
