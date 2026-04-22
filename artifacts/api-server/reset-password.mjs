import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const EMAIL = process.argv[2];
const NEW_PASSWORD = process.argv[3];

if (!EMAIL || !NEW_PASSWORD) {
  console.error('Usage: node reset-password.mjs <email> <new-password>');
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
const hash = await bcrypt.hash(NEW_PASSWORD, 10);
const result = await mongoose.connection.db
  .collection('patients')
  .updateOne({ email: EMAIL }, { $set: { passwordHash: hash } });

if (result.matchedCount === 0) {
  console.error(`No patient found with email: ${EMAIL}`);
} else {
  console.log(`✅ Password updated for ${EMAIL} → "${NEW_PASSWORD}"`);
}

await mongoose.disconnect();
