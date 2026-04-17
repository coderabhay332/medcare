import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import bcrypt from 'bcrypt';
import { PatientModel } from '../../patient/patient.schema.js';

export function setupPassport(): void {
  passport.use(
    'local',
    new LocalStrategy(
      { usernameField: 'email', passwordField: 'password' },
      async (email, password, done) => {
        try {
          const patient = await PatientModel.findOne({ email: email.toLowerCase() });
          if (!patient) {
            return done(null, false, { message: 'Invalid credentials' });
          }

          const isValid = await bcrypt.compare(password, patient.passwordHash);
          if (!isValid) {
            return done(null, false, { message: 'Invalid credentials' });
          }

          return done(null, patient);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  passport.use(
    'jwt',
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: jwtSecret,
      },
      async (payload: { sub: string }, done) => {
        try {
          const patient = await PatientModel.findById(payload.sub);
          if (!patient) {
            return done(null, false);
          }
          return done(null, patient);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
}
