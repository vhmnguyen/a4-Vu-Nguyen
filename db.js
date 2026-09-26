const { MongoClient } = require('mongodb')

async function connectDatabase({
  uri = process.env.MONGODB_URI,
  name = process.env.MONGODB_DB
} = {}) {
  if (!uri || !name) {
    throw new Error(
      'Set MONGODB_URI and MONGODB_DB in .env or the environment before starting the server.'
    )
  }

  let client
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 })
    await client.connect()
    const db = client.db(name)
    await db.command({ ping: 1 })
    await db.collection('users').createIndex({ username: 1 }, { unique: true })
    await db.collection('characters').createIndex({ ownerId: 1 })
    await db.collection('sessions').createIndex({ expires: 1 }, { expireAfterSeconds: 0 })
    await db.collection('authAttempts').createIndex({ expires: 1 }, { expireAfterSeconds: 0 })
    return { client, db }
  } catch {
    if (client) await client.close().catch(() => {})
    throw new Error(
      'Unable to initialize MongoDB. Check MONGODB_URI, MONGODB_DB, database access, and whether MongoDB is running.'
    )
  }
}

module.exports = { connectDatabase }
