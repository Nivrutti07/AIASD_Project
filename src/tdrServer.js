// =========================================================================
// Blood Donation and Emergency Request System - TDR Test Server & Adapter
// Implements the full Test Design Record (TDR) contract & test-mode hooks
// for the 281 test cases in the bloodbank-tests suite.
// =========================================================================

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = 'tdr_jwt_secret_key_2026';
const PASSWORD = 'Passw0rd!';
const HASHED_PASSWORD = bcrypt.hashSync(PASSWORD, 10);

// Controllable virtual clock
let virtualClock = new Date('2026-01-15T10:00:00.000Z');
function now() {
  return new Date(virtualClock.getTime());
}

// In-memory simulation stores for TDR blackbox testing
let db = {
  users: [],
  donors: [],
  declarations: [],
  donations: [],
  lots: [],
  reservations: [],
  requests: [],
  alerts: [],
  drives: [],
  slots: [],
  bookings: [],
  audit: [],
  config: {
    eligibility: { minAge: 18, maxAge: 65, minWeightKg: 50, minIntervalDays: 90 },
    thresholds: [
      { bloodGroup: 'O+', component: 'RED_BLOOD_CELLS', threshold: 10 },
      { bloodGroup: 'O-', component: 'RED_BLOOD_CELLS', threshold: 10 },
      { bloodGroup: 'A+', component: 'RED_BLOOD_CELLS', threshold: 10 },
      { bloodGroup: 'A-', component: 'RED_BLOOD_CELLS', threshold: 10 },
      { bloodGroup: 'B+', component: 'RED_BLOOD_CELLS', threshold: 10 },
      { bloodGroup: 'B-', component: 'RED_BLOOD_CELLS', threshold: 10 },
      { bloodGroup: 'AB+', component: 'RED_BLOOD_CELLS', threshold: 10 },
      { bloodGroup: 'AB-', component: 'RED_BLOOD_CELLS', threshold: 10 }
    ],
    escalation: { criticalMinutes: 30, urgentMinutes: 120 },
    compatibility: {
      RED_BLOOD_CELLS: {
        'O-': ['O-'],
        'O+': ['O-', 'O+'],
        'A-': ['O-', 'A-'],
        'A+': ['O-', 'O+', 'A-', 'A+'],
        'B-': ['O-', 'B-'],
        'B+': ['O-', 'O+', 'B-', 'B+'],
        'AB-': ['O-', 'A-', 'B-', 'AB-'],
        'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']
      },
      PLASMA: {
        'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
        'O+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
        'A-': ['A-', 'A+', 'AB-', 'AB+'],
        'A+': ['A-', 'A+', 'AB-', 'AB+'],
        'B-': ['B-', 'B+', 'AB-', 'AB+'],
        'B+': ['B-', 'B+', 'AB-', 'AB+'],
        'AB-': ['AB-', 'AB+'],
        'AB+': ['AB-', 'AB+']
      }
    }
  },
  banks: [
    { id: 1, name: 'Bank A' },
    { id: 2, name: 'Bank B' }
  ]
};

let outbox = [];
let logs = [];
let notificationFailures = [];
let faults = new Set();
let invalidatedTokens = new Set();

function logMsg(msg) {
  logs.push(`[${now().toISOString()}] ${msg}`);
}

function auditLog(userId, action, details = {}) {
  if (faults.has('audit')) return;
  db.audit.push({
    id: db.audit.length + 1,
    userId: userId || 'anonymous',
    action,
    details,
    createdAt: now().toISOString()
  });
}

// Distance helper (lat/lon in km)
function distanceKm(loc1, loc2) {
  if (!loc1 || !loc2) return 9999;
  const dLat = (loc1.lat - loc2.lat) * 111.19;
  const dLon = (loc1.lon - loc2.lon) * 111.19 * Math.cos(((loc1.lat + loc2.lat) / 2) * (Math.PI / 180));
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

// JWT Authentication Middleware
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  const token = header.slice(7);
  if (invalidatedTokens.has(token)) {
    return res.status(401).json({ error: 'Token has been invalidated (logged out)' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden: role ${req.user?.role} not authorized` });
    }
    next();
  };
}

// =========================================================================
// TEST HOOKS (prefix /__test__)
// =========================================================================

app.post('/__test__/reset', (req, res) => {
  const lots = req.query.lots !== '0';
  const donors = req.query.donors !== '0';
  virtualClock = req.body.now ? new Date(req.body.now) : new Date('2026-01-15T10:00:00.000Z');

  outbox = [];
  logs = [];
  notificationFailures = [];
  faults.clear();
  invalidatedTokens.clear();

  // Reset collections
  db.donors = [];
  db.declarations = [];
  db.donations = [];
  db.lots = [];
  db.reservations = [];
  db.requests = [];
  db.alerts = [];
  db.drives = [];
  db.slots = [];
  db.bookings = [];
  db.audit = [];

  // Reset base users (donor101 user account is always present)
  db.users = [
    { id: 1, email: 'admin@test.local', passwordHash: HASHED_PASSWORD, role: 'ADMIN', name: 'System Admin' },
    { id: 2, email: 'staff1@test.local', passwordHash: HASHED_PASSWORD, role: 'STAFF', name: 'Staff Bank A', bankId: 1 },
    { id: 3, email: 'staff2@test.local', passwordHash: HASHED_PASSWORD, role: 'STAFF', name: 'Staff Bank B', bankId: 2 },
    { id: 4, email: 'hospital1@test.local', passwordHash: HASHED_PASSWORD, role: 'HOSPITAL', name: 'Hospital H1' },
    { id: 5, email: 'hospital2@test.local', passwordHash: HASHED_PASSWORD, role: 'HOSPITAL', name: 'Hospital H2' },
    { id: 101, email: 'donor101@test.local', passwordHash: HASHED_PASSWORD, role: 'DONOR', name: 'Donor 101' }
  ];

  if (donors) {
    db.donors.push({
      id: 101,
      userId: 101,
      name: 'Donor 101',
      bloodGroup: 'O+',
      dateOfBirth: '1995-12-16',
      weightKg: 70,
      phone: '+919800000101',
      location: { lat: 12.95, lon: 77.6, label: 'Home' },
      lastDonationDate: '2025-09-17',
      deferralUntil: null,
      declarationComplete: true,
      emergencyAvailable: true,
      alertsSent: 0,
      alertsAccepted: 0,
      createdAt: now().toISOString(),
      updatedAt: now().toISOString()
    });
  }

  if (lots) {
    db.lots.push({
      id: 1,
      bankId: 1,
      bloodGroup: 'O+',
      component: 'RED_BLOOD_CELLS',
      quantity: 10,
      reserved: 0,
      collectionDate: '2026-01-15',
      expiryDate: '2026-02-19'
    });
  }

  res.status(200).json({ ok: true, now: virtualClock.toISOString() });
});

app.post('/__test__/seed', (req, res) => {
  const { donors, lots, requests, drives, donations, banks } = req.body;

  if (banks && Array.isArray(banks)) {
    banks.forEach(b => {
      const idx = db.banks.findIndex(x => x.id === b.id);
      if (idx >= 0) db.banks[idx] = b;
      else db.banks.push(b);
    });
  }

  if (donors && Array.isArray(donors)) {
    donors.forEach(d => {
      // Also ensure user exists
      const email = `donor${d.id}@test.local`;
      let user = db.users.find(u => u.email === email);
      if (!user) {
        user = { id: d.id, email, passwordHash: HASHED_PASSWORD, role: 'DONOR', name: d.name || `Donor ${d.id}` };
        db.users.push(user);
      }
      const existingIdx = db.donors.findIndex(x => x.id === d.id);
      const donorRow = {
        userId: user.id,
        createdAt: now().toISOString(),
        updatedAt: now().toISOString(),
        declarationComplete: true,
        emergencyAvailable: true,
        alertsSent: 0,
        alertsAccepted: 0,
        ...d
      };
      if (existingIdx >= 0) db.donors[existingIdx] = donorRow;
      else db.donors.push(donorRow);
    });
  }

  if (lots && Array.isArray(lots)) {
    lots.forEach(l => {
      const existingIdx = db.lots.findIndex(x => x.id === l.id);
      const lotRow = { bankId: 1, reserved: 0, ...l };
      if (existingIdx >= 0) db.lots[existingIdx] = lotRow;
      else db.lots.push(lotRow);
    });
  }

  if (requests && Array.isArray(requests)) {
    requests.forEach(r => {
      const existingIdx = db.requests.findIndex(x => x.id === r.id);
      const reqRow = {
        status: 'OPEN',
        fulfilledUnits: 0,
        escalated: false,
        createdAt: now().toISOString(),
        ...r
      };
      if (existingIdx >= 0) db.requests[existingIdx] = reqRow;
      else db.requests.push(reqRow);
    });
  }

  if (donations && Array.isArray(donations)) {
    donations.forEach(dn => db.donations.push(dn));
  }

  if (drives && Array.isArray(drives)) {
    drives.forEach(drv => {
      const driveRow = { id: drv.id, name: drv.name, location: drv.location, date: drv.date, slots: drv.slots || [] };
      db.drives.push(driveRow);
      if (drv.slots) {
        drv.slots.forEach(sl => {
          db.slots.push({ ...sl, driveId: drv.id });
          if (drv.bookingsCount) {
            for (let i = 0; i < drv.bookingsCount; i++) {
              db.bookings.push({
                id: db.bookings.length + 1,
                slotId: sl.id,
                driveId: drv.id,
                donorId: 9000 + i,
                status: 'BOOKED',
                createdAt: now().toISOString()
              });
            }
          }
        });
      }
    });
  }

  res.status(200).json({ ok: true });
});

app.post('/__test__/clock', (req, res) => {
  if (req.body.now) {
    virtualClock = new Date(req.body.now);
  } else if (req.body.advanceMs) {
    virtualClock = new Date(virtualClock.getTime() + req.body.advanceMs);
  }
  res.status(200).json({ now: virtualClock.toISOString() });
});

app.post('/__test__/tick', (req, res) => {
  // Tick evaluates background jobs: low stock alerts, request escalations
  const currentTime = now();

  // 1. Low stock check
  db.config.thresholds.forEach(th => {
    const unexpiredLots = db.lots.filter(l =>
      l.bloodGroup === th.bloodGroup &&
      l.component === th.component &&
      new Date(l.expiryDate) > currentTime
    );
    const available = unexpiredLots.reduce((acc, l) => acc + (Number(l.quantity) - Number(l.reserved || 0)), 0);
    if (available < th.threshold) {
      outbox.push({
        kind: 'LOW_STOCK',
        bloodGroup: th.bloodGroup,
        component: th.component,
        available,
        threshold: th.threshold,
        sentAt: currentTime.toISOString()
      });
    }
  });

  // 2. Escalation check
  db.requests.forEach(r => {
    if (r.status === 'OPEN' || r.status === 'PARTIALLY_FULFILLED') {
      const created = new Date(r.createdAt || currentTime);
      const ageMinutes = (currentTime.getTime() - created.getTime()) / (60 * 1000);
      const limitMinutes = r.urgency === 'CRITICAL' ? db.config.escalation.criticalMinutes : db.config.escalation.urgentMinutes;
      if (ageMinutes >= limitMinutes && !r.escalated) {
        r.escalated = true;
        outbox.push({
          kind: 'ESCALATION',
          requestId: r.id,
          urgency: r.urgency,
          sentAt: currentTime.toISOString()
        });
      }
    }
  });

  res.status(200).json({ ok: true, tickedAt: currentTime.toISOString() });
});

app.get('/__test__/outbox', (req, res) => {
  res.status(200).json(outbox);
});

app.post('/__test__/outbox/clear', (req, res) => {
  outbox = [];
  res.status(200).json({ ok: true });
});

app.get('/__test__/notification-failures', (req, res) => {
  res.status(200).json(notificationFailures);
});

app.post('/__test__/fault', (req, res) => {
  const { name, enabled } = req.body;
  if (name === '*' && !enabled) faults.clear();
  else if (enabled) faults.add(name);
  else faults.delete(name);
  res.status(200).json({ ok: true });
});

app.get('/__test__/db/:table', (req, res) => {
  const table = req.params.table;
  if (table === 'config') {
    return res.status(200).json(JSON.parse(JSON.stringify([db.config])));
  }
  res.status(200).json(db[table] || []);
});

app.post('/__test__/db/:table', (req, res) => {
  const table = req.params.table;
  if (!db[table]) db[table] = [];
  db[table].push(req.body);
  res.status(201).json(req.body);
});

app.delete('/__test__/db/:table/:id', (req, res) => {
  const { table, id } = req.params;
  if (db[table]) {
    db[table] = db[table].filter(row => String(row.id) !== String(id));
  }
  res.status(200).json({ ok: true });
});

app.get('/__test__/logs', (req, res) => {
  res.type('text/plain').send(logs.join('\n'));
});

app.post('/__test__/token', (req, res) => {
  const { userKey, expired } = req.body;
  const email = `${userKey}@test.local`;
  const user = db.users.find(u => u.email === email) || { id: 999, email, role: 'STAFF' };
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, bankId: user.bankId || 1 },
    JWT_SECRET,
    { expiresIn: expired ? -10 : '24h' }
  );
  res.status(200).json({ token });
});

// =========================================================================
// API ROUTES IMPLEMENTATION (matching test/helpers/routes.js)
// =========================================================================

// FR-01: Auth
app.post('/api/auth/register', (req, res) => {
  const { email, password, name, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Missing field: email' });
  if (!password) return res.status(400).json({ error: 'Missing field: password' });
  if (!role) return res.status(400).json({ error: 'Missing field: role' });

  // Email format validation
  if (!email.includes('@') || email.endsWith('@')) {
    return res.status(400).json({ error: 'Invalid email address format' });
  }

  // Password length boundary: >= 8 characters
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  // Public registration cannot be ADMIN or STAFF
  if (['ADMIN', 'STAFF'].includes(role.toUpperCase())) {
    return res.status(403).json({ error: 'Public registration for ADMIN or STAFF is prohibited' });
  }

  // Duplicate email check (case-insensitive)
  if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'Duplicate email: an account already exists' });
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const user = {
    id: db.users.length + 101,
    email,
    passwordHash,
    role: role.toUpperCase(),
    name: name || 'User'
  };
  db.users.push(user);
  auditLog(user.id, 'USER_REGISTERED', { email, role: user.role });

  // Safe response: NEVER include password or password hash
  return res.status(201).json({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  // Find user (case-insensitive)
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const isMatch = bcrypt.compareSync(password, user.passwordHash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, bankId: user.bankId || 1 },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  return res.status(200).json({
    token,
    role: user.role,
    user: { id: user.id, email: user.email, role: user.role, name: user.name }
  });
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  const token = req.headers.authorization.slice(7);
  invalidatedTokens.add(token);
  res.status(200).json({ ok: true, message: 'Logged out successfully' });
});

app.post('/api/admin/users', authMiddleware, requireRole('ADMIN'), (req, res) => {
  const { email, password, name, role, bankId } = req.body;
  const user = {
    id: db.users.length + 101,
    email,
    passwordHash: bcrypt.hashSync(password || PASSWORD, 10),
    role: role || 'STAFF',
    bankId: bankId || 1,
    name: name || 'Staff User'
  };
  db.users.push(user);
  res.status(201).json({ id: user.id, email: user.email, role: user.role, bankId: user.bankId });
});

// FR-02: Donors
app.post('/api/donors', authMiddleware, (req, res) => {
  const { bloodGroup, weightKg, dateOfBirth, phone, location, name } = req.body;

  if (!bloodGroup) return res.status(400).json({ error: 'Missing field: bloodGroup' });
  if (weightKg === undefined) return res.status(400).json({ error: 'Missing field: weightKg' });
  if (!dateOfBirth) return res.status(400).json({ error: 'Missing field: dateOfBirth' });

  const validGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  if (!validGroups.includes(bloodGroup)) {
    return res.status(400).json({ error: `Invalid blood group: ${bloodGroup}` });
  }

  const weight = Number(weightKg);
  if (isNaN(weight) || weight <= 0) {
    return res.status(400).json({ error: 'Weight must be a positive number' });
  }

  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime()) || dob > now()) {
    return res.status(400).json({ error: 'Invalid date of birth' });
  }

  if (phone !== undefined && (phone === '' || !/^\+?[0-9\s-]{7,15}$/.test(phone))) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  if (db.donors.some(d => String(d.userId) === String(req.user.id))) {
    return res.status(409).json({ error: 'Donor profile already exists for this user' });
  }

  const donor = {
    id: db.donors.length + 101,
    userId: req.user.id,
    name: name || req.user.name || 'Donor',
    bloodGroup,
    weightKg: weight,
    dateOfBirth,
    phone: phone || '+919800000000',
    location: location || { lat: 12.95, lon: 77.6, label: 'Home' },
    declarationComplete: false,
    emergencyAvailable: true,
    alertsSent: 0,
    alertsAccepted: 0,
    createdAt: now().toISOString(),
    updatedAt: now().toISOString()
  };
  db.donors.push(donor);
  res.status(201).json(donor);
});

app.get('/api/donors/me', authMiddleware, (req, res) => {
  const donor = db.donors.find(d => String(d.userId) === String(req.user.id));
  if (!donor) return res.status(404).json({ error: 'Donor profile not found' });
  res.status(200).json(donor);
});

app.get('/api/donors/:id', authMiddleware, (req, res) => {
  const donor = db.donors.find(d => String(d.id) === String(req.params.id));
  if (!donor) return res.status(404).json({ error: 'Donor not found' });

  // Privacy Rule: Hospital requesters never receive phone numbers
  if (req.user.role === 'HOSPITAL') {
    const copy = { ...donor };
    delete copy.phone;
    delete copy.phoneNumber;
    return res.status(200).json(copy);
  }
  res.status(200).json(donor);
});

app.put('/api/donors/:id', authMiddleware, (req, res) => {
  const donor = db.donors.find(d => String(d.id) === String(req.params.id));
  if (!donor) return res.status(404).json({ error: 'Donor not found' });

  // Only donor themselves, staff, or admin can update
  if (req.user.role === 'DONOR' && String(donor.userId) !== String(req.user.id)) {
    return res.status(403).json({ error: 'Forbidden: cannot update another donor profile' });
  }

  if (req.body.weightKg !== undefined) {
    const wt = Number(req.body.weightKg);
    if (isNaN(wt) || wt <= 0) return res.status(400).json({ error: 'Invalid weight' });
    donor.weightKg = wt;
  }
  if (req.body.emergencyAvailable !== undefined) {
    donor.emergencyAvailable = Boolean(req.body.emergencyAvailable);
  }
  donor.updatedAt = now().toISOString();
  res.status(200).json(donor);
});

app.post('/api/donors/me/declaration', authMiddleware, (req, res) => {
  const donor = db.donors.find(d => String(d.userId) === String(req.user.id));
  if (!donor) return res.status(404).json({ error: 'Donor not found' });
  donor.declarationComplete = true;
  donor.updatedAt = now().toISOString();
  db.declarations.push({ donorId: donor.id, ...req.body, completedAt: now().toISOString() });
  res.status(200).json({ ok: true });
});

app.post('/api/donors/me/availability', authMiddleware, (req, res) => {
  const donor = db.donors.find(d => String(d.userId) === String(req.user.id));
  if (!donor) return res.status(404).json({ error: 'Donor not found' });
  donor.emergencyAvailable = Boolean(req.body.emergencyAvailable);
  donor.updatedAt = now().toISOString();
  res.status(200).json({ ok: true });
});

app.get('/api/donors/:id/history', authMiddleware, (req, res) => {
  const donations = db.donations.filter(d => String(d.donorId) === String(req.params.id));
  res.status(200).json(donations);
});

app.post('/api/donations', authMiddleware, requireRole('STAFF', 'ADMIN'), (req, res) => {
  const donation = { id: db.donations.length + 1, ...req.body, recordedAt: now().toISOString() };
  db.donations.push(donation);
  res.status(201).json(donation);
});

// FR-03: Eligibility
app.get('/api/donors/:id/eligibility', authMiddleware, (req, res) => {
  const donor = db.donors.find(d => String(d.id) === String(req.params.id));
  if (!donor) return res.status(404).json({ error: 'Donor not found' });

  const cfg = db.config.eligibility;
  const reasons = [];
  const currentTime = now();

  // Age calculation
  const dob = new Date(donor.dateOfBirth);
  let age = currentTime.getUTCFullYear() - dob.getUTCFullYear();
  const m = currentTime.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && currentTime.getUTCDate() < dob.getUTCDate())) age--;

  if (age < cfg.minAge || age > cfg.maxAge) {
    reasons.push('AGE');
  }

  // Weight check
  if (Number(donor.weightKg) < cfg.minWeightKg) {
    reasons.push('WEIGHT');
  }

  // Deferral check
  if (donor.deferralUntil) {
    const deferral = new Date(donor.deferralUntil);
    if (deferral > currentTime) {
      reasons.push('DEFERRAL');
    }
  }

  // Interval check
  let nextEligibleDate = null;
  if (donor.lastDonationDate) {
    const last = new Date(donor.lastDonationDate);
    const eligibleAfter = new Date(last.getTime() + cfg.minIntervalDays * 864e5);
    if (eligibleAfter > currentTime) {
      reasons.push('INTERVAL');
      nextEligibleDate = eligibleAfter.toISOString().slice(0, 10);
    }
  }

  reasons.sort();
  const eligible = reasons.length === 0;

  res.status(200).json({
    donorId: donor.id,
    eligible,
    reasons,
    nextEligibleDate
  });
});

app.put('/api/admin/config/eligibility', authMiddleware, requireRole('ADMIN'), (req, res) => {
  const { minAge, maxAge, minWeightKg, minIntervalDays } = req.body;
  if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) {
    return res.status(400).json({ error: 'minAge cannot exceed maxAge' });
  }
  if (minIntervalDays !== undefined && minIntervalDays < 0) {
    return res.status(400).json({ error: 'minIntervalDays cannot be negative' });
  }
  Object.assign(db.config.eligibility, req.body);
  res.status(200).json(db.config.eligibility);
});

// FR-04 & FR-05: Inventory & Expiry
app.post('/api/inventory/lots', authMiddleware, requireRole('STAFF', 'ADMIN'), (req, res) => {
  const { bloodGroup, component, collectionDate, expiryDate, quantity } = req.body;
  for (const k of ['bloodGroup', 'component', 'collectionDate', 'expiryDate', 'quantity']) {
    if (req.body[k] === undefined || req.body[k] === '') {
      return res.status(400).json({ error: `Missing required field: ${k}` });
    }
  }

  const validGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  if (!validGroups.includes(bloodGroup)) return res.status(400).json({ error: 'Invalid bloodGroup' });

  if (!['RED_BLOOD_CELLS', 'PLASMA', 'RBC'].includes(component)) {
    return res.status(400).json({ error: 'Unsupported component' });
  }

  const qty = Number(quantity);
  if (isNaN(qty) || !Number.isInteger(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive integer' });
  }

  const colDate = new Date(collectionDate);
  const expDate = new Date(expiryDate);
  if (colDate > now()) return res.status(400).json({ error: 'Collection date cannot be in the future' });
  if (expDate <= colDate) return res.status(400).json({ error: 'Expiry date must be after collection date' });
  if (expDate < now()) return res.status(400).json({ error: 'Expiry date cannot be in the past' });

  const lot = {
    id: db.lots.length + 1,
    bankId: req.user.bankId || 1,
    bloodGroup,
    component,
    collectionDate,
    expiryDate,
    quantity: qty,
    reserved: 0
  };
  db.lots.push(lot);
  res.status(201).json(lot);
});

app.get('/api/inventory', authMiddleware, (req, res) => {
  const groups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const components = ['RED_BLOOD_CELLS', 'PLASMA'];
  const summary = [];
  const currentTime = now();

  groups.forEach(bg => {
    components.forEach(comp => {
      const matching = db.lots.filter(l =>
        l.bloodGroup === bg &&
        (l.component === comp || (comp === 'RED_BLOOD_CELLS' && l.component === 'RBC')) &&
        new Date(l.expiryDate) > currentTime
      );
      const total = matching.reduce((sum, l) => sum + Number(l.quantity), 0);
      const reserved = matching.reduce((sum, l) => sum + Number(l.reserved || 0), 0);
      const available = total - reserved;
      summary.push({ bloodGroup: bg, component: comp, total, reserved, available });
    });
  });

  res.status(200).json(summary);
});

app.get('/api/inventory/lots/:id', authMiddleware, (req, res) => {
  const lot = db.lots.find(l => String(l.id) === String(req.params.id));
  if (!lot) return res.status(404).json({ error: 'Lot not found' });
  res.status(200).json(lot);
});

app.put('/api/inventory/lots/:id', authMiddleware, requireRole('STAFF', 'ADMIN'), (req, res) => {
  const lot = db.lots.find(l => String(l.id) === String(req.params.id));
  if (!lot) return res.status(404).json({ error: 'Lot not found' });

  const newQty = Number(req.body.quantity);
  if (isNaN(newQty) || newQty < 0) return res.status(400).json({ error: 'Invalid quantity' });
  if (newQty < Number(lot.reserved || 0)) {
    return res.status(400).json({ error: 'Quantity cannot be set below reserved units' });
  }

  lot.quantity = newQty;
  res.status(200).json(lot);
});

// FR-05 & FR-10: Reservations & Transfers
app.post('/api/inventory/lots/:id/reserve', authMiddleware, requireRole('STAFF', 'ADMIN'), (req, res) => {
  const lot = db.lots.find(l => String(l.id) === String(req.params.id));
  if (!lot) return res.status(404).json({ error: 'Lot not found' });

  // Expired lot cannot be reserved
  if (new Date(lot.expiryDate) <= now()) {
    return res.status(400).json({ error: 'Cannot reserve expired lot' });
  }

  const units = Number(req.body.units);
  if (isNaN(units) || units <= 0) return res.status(400).json({ error: 'Invalid units' });

  const available = Number(lot.quantity) - Number(lot.reserved || 0);
  if (units > available) {
    return res.status(400).json({ error: 'Insufficient available units in lot' });
  }

  lot.reserved = Number(lot.reserved || 0) + units;
  db.reservations.push({
    id: db.reservations.length + 1,
    lotId: lot.id,
    requestId: req.body.requestId,
    units,
    createdAt: now().toISOString()
  });
  res.status(200).json({ ok: true, lot });
});

app.post('/api/inventory/lots/:id/release', authMiddleware, requireRole('STAFF', 'ADMIN'), (req, res) => {
  const lot = db.lots.find(l => String(l.id) === String(req.params.id));
  if (!lot) return res.status(404).json({ error: 'Lot not found' });

  const resIdx = db.reservations.findIndex(r => String(r.lotId) === String(lot.id) && String(r.requestId) === String(req.body.requestId));
  if (resIdx >= 0) {
    const r = db.reservations[resIdx];
    lot.reserved = Math.max(0, Number(lot.reserved || 0) - Number(r.units));
    db.reservations.splice(resIdx, 1);
  }
  res.status(200).json({ ok: true, lot });
});

app.post('/api/inventory/lots/:id/issue', authMiddleware, requireRole('STAFF', 'ADMIN'), (req, res) => {
  const lot = db.lots.find(l => String(l.id) === String(req.params.id));
  if (!lot) return res.status(404).json({ error: 'Lot not found' });

  const units = Number(req.body.units);
  lot.quantity = Math.max(0, Number(lot.quantity) - units);
  lot.reserved = Math.max(0, Number(lot.reserved || 0) - units);
  res.status(200).json({ ok: true, lot });
});

app.post('/api/inventory/transfers', authMiddleware, requireRole('STAFF', 'ADMIN'), (req, res) => {
  const { lotId, toBankId, units } = req.body;
  const lot = db.lots.find(l => String(l.id) === String(lotId));
  if (!lot) return res.status(404).json({ error: 'Lot not found' });

  if (new Date(lot.expiryDate) <= now()) {
    return res.status(400).json({ error: 'Cannot transfer expired lot' });
  }

  const qty = Number(units);
  if (isNaN(qty) || !Number.isInteger(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Transfer units must be positive integer' });
  }

  const available = Number(lot.quantity) - Number(lot.reserved || 0);
  if (qty > available) {
    return res.status(400).json({ error: 'Insufficient available quantity for transfer' });
  }

  lot.quantity = Number(lot.quantity) - qty;

  const destLot = {
    id: db.lots.length + 1,
    bankId: Number(toBankId),
    bloodGroup: lot.bloodGroup,
    component: lot.component,
    quantity: qty,
    reserved: 0,
    collectionDate: lot.collectionDate,
    expiryDate: lot.expiryDate
  };
  db.lots.push(destLot);
  res.status(200).json({ ok: true, sourceLot: lot, destinationLot: destLot });
});

// FR-07: Compatibility
app.get('/api/compatibility', authMiddleware, (req, res) => {
  const { recipient, component } = req.query;
  const comp = component === 'PLASMA' ? 'PLASMA' : (component === 'RED_BLOOD_CELLS' ? 'RED_BLOOD_CELLS' : null);
  if (!comp) return res.status(400).json({ error: 'Invalid or unsupported component' });

  const matrix = db.config.compatibility[comp] || {};
  const donors = matrix[recipient];
  if (!donors) return res.status(400).json({ error: 'Invalid recipient blood group' });

  res.status(200).json({ recipient, component: comp, compatibleDonors: donors });
});

app.get('/api/compatibility/check', authMiddleware, (req, res) => {
  const { donor, recipient, component } = req.query;
  const validGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  if (!validGroups.includes(donor) || !validGroups.includes(recipient)) {
    return res.status(400).json({ error: 'Invalid blood group' });
  }

  const comp = component === 'PLASMA' ? 'PLASMA' : (component === 'RED_BLOOD_CELLS' ? 'RED_BLOOD_CELLS' : null);
  if (!comp) return res.status(400).json({ error: 'Invalid component' });

  const list = db.config.compatibility[comp]?.[recipient] || [];
  const compatible = list.includes(donor);
  res.status(200).json({ donor, recipient, component: comp, compatible });
});

app.put('/api/admin/config/compatibility', authMiddleware, requireRole('ADMIN'), (req, res) => {
  const { component, recipient, donors } = req.body;
  const comp = component === 'PLASMA' ? 'PLASMA' : 'RED_BLOOD_CELLS';
  if (!db.config.compatibility[comp]) db.config.compatibility[comp] = {};
  db.config.compatibility[comp][recipient] = donors;
  res.status(200).json({ ok: true });
});

app.put('/api/admin/config/thresholds', authMiddleware, requireRole('ADMIN'), (req, res) => {
  const { bloodGroup, component, threshold } = req.body;
  const entry = db.config.thresholds.find(t => t.bloodGroup === bloodGroup && t.component === component);
  if (entry) entry.threshold = Number(threshold);
  else db.config.thresholds.push({ bloodGroup, component, threshold: Number(threshold) });
  res.status(200).json({ ok: true });
});

// FR-06 & FR-09: Requests & Fulfilment
app.post('/api/requests', authMiddleware, (req, res) => {
  if (req.user.role !== 'HOSPITAL') {
    return res.status(403).json({ error: 'Forbidden: only Hospital users can create emergency requests' });
  }

  const { bloodGroup, component, units, urgency, location, requiredBy } = req.body;
  for (const k of ['bloodGroup', 'component', 'units', 'urgency', 'location', 'requiredBy']) {
    if (req.body[k] === undefined || req.body[k] === '') {
      return res.status(400).json({ error: `Missing required field: ${k}` });
    }
  }

  const validGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  if (!validGroups.includes(bloodGroup)) return res.status(400).json({ error: 'Invalid bloodGroup' });

  if (!['RED_BLOOD_CELLS', 'PLASMA', 'RBC'].includes(component)) {
    return res.status(400).json({ error: 'Unsupported component' });
  }

  if (!['CRITICAL', 'HIGH', 'NORMAL'].includes(urgency)) {
    return res.status(400).json({ error: 'Invalid urgency' });
  }

  const u = Number(units);
  if (isNaN(u) || !Number.isInteger(u) || u <= 0) {
    return res.status(400).json({ error: 'Units must be a positive integer' });
  }

  const reqBy = new Date(requiredBy);
  if (isNaN(reqBy.getTime()) || reqBy <= now()) {
    return res.status(400).json({ error: 'requiredBy must be in the future' });
  }

  const request = {
    id: db.requests.length + 101,
    hospitalId: req.user.id,
    bloodGroup,
    component,
    units: u,
    urgency,
    location,
    requiredBy,
    status: 'OPEN',
    fulfilledUnits: 0,
    escalated: false,
    createdAt: now().toISOString()
  };
  db.requests.push(request);

  // Fulfilment logic: check inventory first
  logMsg(`INVENTORY_CHECK for request ${request.id}`);

  const compType = component === 'PLASMA' ? 'PLASMA' : 'RED_BLOOD_CELLS';
  const compatDonors = db.config.compatibility[compType]?.[bloodGroup] || [];

  const unexpiredLots = db.lots.filter(l =>
    compatDonors.includes(l.bloodGroup) &&
    (l.component === component || (compType === 'RED_BLOOD_CELLS' && l.component === 'RBC')) &&
    new Date(l.expiryDate) > now()
  );

  let needed = u;
  for (const lot of unexpiredLots) {
    const avail = Number(lot.quantity) - Number(lot.reserved || 0);
    if (avail > 0) {
      const take = Math.min(avail, needed);
      lot.reserved = Number(lot.reserved || 0) + take;
      needed -= take;
      db.reservations.push({
        id: db.reservations.length + 1,
        lotId: lot.id,
        requestId: request.id,
        units: take,
        createdAt: now().toISOString()
      });
      if (needed === 0) break;
    }
  }

  request.fulfilledUnits = u - needed;
  if (needed === 0) {
    request.status = 'FULFILLED';
  } else if (needed < u) {
    request.status = 'PARTIALLY_FULFILLED';
  } else {
    request.status = 'OPEN';
  }

  // If unfulfilled units remain, trigger donor alerts
  if (needed > 0) {
    logMsg(`DONOR_ALERT for request ${request.id}`);

    // Rank eligible donors
    const eligibleDonors = db.donors.filter(d => {
      if (!compatDonors.includes(d.bloodGroup)) return false;
      if (d.emergencyAvailable === false) return false;
      if (d.deferralUntil && new Date(d.deferralUntil) > now()) return false;
      if (d.lastDonationDate) {
        const last = new Date(d.lastDonationDate);
        if (new Date(last.getTime() + db.config.eligibility.minIntervalDays * 864e5) > now()) return false;
      }
      return true;
    });

    // Sort donors: exact match first, then closer distance, then rest days, then response rate, then ID
    eligibleDonors.sort((a, b) => {
      const aExact = a.bloodGroup === bloodGroup ? 1 : 0;
      const bExact = b.bloodGroup === bloodGroup ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;

      const distA = distanceKm(a.location, location);
      const distB = distanceKm(b.location, location);
      if (Math.abs(distA - distB) > 0.01) return distA - distB;

      const restA = a.lastDonationDate ? now().getTime() - new Date(a.lastDonationDate).getTime() : 9999999;
      const restB = b.lastDonationDate ? now().getTime() - new Date(b.lastDonationDate).getTime() : 9999999;
      if (restA !== restB) return restB - restA;

      const rateA = a.alertsSent ? a.alertsAccepted / a.alertsSent : 1;
      const rateB = b.alertsSent ? b.alertsAccepted / b.alertsSent : 1;
      if (rateA !== rateB) return rateB - rateA;

      return a.id - b.id;
    });

    eligibleDonors.forEach(d => {
      outbox.push({
        to: d.id,
        donorId: d.id,
        kind: 'DONOR_ALERT',
        units: needed,
        requestId: request.id,
        sentAt: now().toISOString()
      });
    });
  }

  res.status(201).json(request);
});

app.get('/api/requests', authMiddleware, (req, res) => {
  let list = db.requests;
  if (req.user.role === 'HOSPITAL') {
    list = list.filter(r => String(r.hospitalId) === String(req.user.id));
  }
  res.status(200).json(list);
});

app.get('/api/requests/:id', authMiddleware, (req, res) => {
  const reqRow = db.requests.find(r => String(r.id) === String(req.params.id));
  if (!reqRow) return res.status(404).json({ error: 'Request not found' });
  res.status(200).json(reqRow);
});

// FR-08: Matches
app.get('/api/requests/:id/matches', authMiddleware, (req, res) => {
  const reqRow = db.requests.find(r => String(r.id) === String(req.params.id));
  if (!reqRow) return res.status(404).json({ error: 'Request not found' });

  const compType = reqRow.component === 'PLASMA' ? 'PLASMA' : 'RED_BLOOD_CELLS';
  const compatDonors = db.config.compatibility[compType]?.[reqRow.bloodGroup] || [];

  const eligibleDonors = db.donors.filter(d => {
    if (!compatDonors.includes(d.bloodGroup)) return false;
    if (d.emergencyAvailable === false) return false;
    if (d.deferralUntil && new Date(d.deferralUntil) > now()) return false;
    if (d.lastDonationDate) {
      const last = new Date(d.lastDonationDate);
      if (new Date(last.getTime() + db.config.eligibility.minIntervalDays * 864e5) > now()) return false;
    }
    return true;
  });

  eligibleDonors.sort((a, b) => {
    const aExact = a.bloodGroup === reqRow.bloodGroup ? 1 : 0;
    const bExact = b.bloodGroup === reqRow.bloodGroup ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;

    const distA = distanceKm(a.location, reqRow.location);
    const distB = distanceKm(b.location, reqRow.location);
    if (Math.abs(distA - distB) > 0.01) return distA - distB;

    const restA = a.lastDonationDate ? now().getTime() - new Date(a.lastDonationDate).getTime() : 9999999;
    const restB = b.lastDonationDate ? now().getTime() - new Date(b.lastDonationDate).getTime() : 9999999;
    if (restA !== restB) return restB - restA;

    const rateA = a.alertsSent ? a.alertsAccepted / a.alertsSent : 1;
    const rateB = b.alertsSent ? b.alertsAccepted / b.alertsSent : 1;
    if (rateA !== rateB) return rateB - rateA;

    return a.id - b.id;
  });

  res.status(200).json(eligibleDonors);
});

// FR-11: Drives
app.post('/api/drives', authMiddleware, requireRole('STAFF', 'ADMIN'), (req, res) => {
  const { name, location, date, slots } = req.body;
  for (const k of ['name', 'location', 'date', 'slots']) {
    if (req.body[k] === undefined || req.body[k] === '') {
      return res.status(400).json({ error: `Missing required field: ${k}` });
    }
  }

  const dDate = new Date(date);
  if (isNaN(dDate.getTime()) || dDate < now()) {
    return res.status(400).json({ error: 'Drive date must be in the future' });
  }

  for (const sl of slots) {
    if (sl.startTime >= sl.endTime) {
      return res.status(400).json({ error: 'Slot start time must precede end time' });
    }
    const cap = Number(sl.capacity);
    if (isNaN(cap) || !Number.isInteger(cap) || cap <= 0) {
      return res.status(400).json({ error: 'Slot capacity must be a positive integer' });
    }
  }

  const drive = {
    id: db.drives.length + 1,
    name,
    location,
    date,
    slots: slots.map((sl, i) => ({
      id: db.slots.length + i + 1,
      startTime: sl.startTime,
      endTime: sl.endTime,
      capacity: sl.capacity,
      remainingSeats: sl.capacity
    }))
  };
  db.drives.push(drive);
  drive.slots.forEach(s => db.slots.push({ ...s, driveId: drive.id }));
  res.status(201).json(drive);
});

app.get('/api/drives', authMiddleware, (req, res) => {
  res.status(200).json(db.drives);
});

app.post('/api/drives/:id/slots/:slotId/bookings', authMiddleware, (req, res) => {
  const drive = db.drives.find(d => String(d.id) === String(req.params.id));
  const slot = db.slots.find(s => String(s.id) === String(req.params.slotId));
  if (!drive || !slot) return res.status(404).json({ error: 'Drive or slot not found' });

  const donor = db.donors.find(d => String(d.userId) === String(req.user.id));
  if (!donor) return res.status(400).json({ error: 'Donor profile required' });

  // Eligibility check
  if (donor.declarationComplete === false) {
    return res.status(400).json({ error: 'Medical declaration required before booking' });
  }
  if (Number(donor.weightKg) < db.config.eligibility.minWeightKg) {
    return res.status(400).json({ error: 'WEIGHT below minimum' });
  }
  if (donor.lastDonationDate) {
    const last = new Date(donor.lastDonationDate);
    const driveDate = new Date(drive.date);
    if (new Date(last.getTime() + db.config.eligibility.minIntervalDays * 864e5) > driveDate) {
      return res.status(400).json({ error: 'INTERVAL not met between donations' });
    }
  }

  // Capacity check
  const activeBookings = db.bookings.filter(b => String(b.slotId) === String(slot.id) && b.status !== 'CANCELLED');
  if (activeBookings.length >= slot.capacity) {
    return res.status(400).json({ error: 'Slot is at full capacity' });
  }

  const booking = {
    id: db.bookings.length + 1,
    driveId: drive.id,
    slotId: slot.id,
    donorId: donor.id,
    status: 'BOOKED',
    createdAt: now().toISOString()
  };
  db.bookings.push(booking);
  slot.remainingSeats = slot.capacity - (activeBookings.length + 1);
  res.status(201).json(booking);
});

// FR-12: Reports
app.get('/api/reports/inventory', authMiddleware, requireRole('STAFF', 'ADMIN'), (req, res) => {
  const groups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const components = ['RED_BLOOD_CELLS', 'PLASMA'];
  const report = [];
  const currentTime = now();

  groups.forEach(bg => {
    components.forEach(comp => {
      const allLots = db.lots.filter(l =>
        l.bloodGroup === bg &&
        (l.component === comp || (comp === 'RED_BLOOD_CELLS' && l.component === 'RBC'))
      );
      const expiredLots = allLots.filter(l => new Date(l.expiryDate) <= currentTime);
      const validLots = allLots.filter(l => new Date(l.expiryDate) > currentTime);

      const total = allLots.reduce((sum, l) => sum + Number(l.quantity), 0);
      const expired = expiredLots.reduce((sum, l) => sum + Number(l.quantity), 0);
      const reserved = validLots.reduce((sum, l) => sum + Number(l.reserved || 0), 0);
      const available = validLots.reduce((sum, l) => sum + (Number(l.quantity) - Number(l.reserved || 0)), 0);

      report.push({ bloodGroup: bg, component: comp, total, reserved, expired, available });
    });
  });

  res.status(200).json(report);
});

app.get('/api/reports/requests', authMiddleware, requireRole('STAFF', 'ADMIN'), (req, res) => {
  const byStatus = { OPEN: 0, PARTIALLY_FULFILLED: 0, FULFILLED: 0, RECEIVED: 0 };
  let openCritical = 0;

  db.requests.forEach(r => {
    if (byStatus[r.status] !== undefined) byStatus[r.status]++;
    if (r.status === 'OPEN' && r.urgency === 'CRITICAL') openCritical++;
  });

  res.status(200).json({ byStatus, openCritical });
});

app.get('/api/reports/donors', authMiddleware, requireRole('STAFF', 'ADMIN'), (req, res) => {
  const byBloodGroup = { 'A+': 0, 'A-': 0, 'B+': 0, 'B-': 0, 'AB+': 0, 'AB-': 0, 'O+': 0, 'O-': 0 };
  let eligibleCount = 0;

  db.donors.forEach(d => {
    if (byBloodGroup[d.bloodGroup] !== undefined) byBloodGroup[d.bloodGroup]++;
    if (Number(d.weightKg) >= db.config.eligibility.minWeightKg) eligibleCount++;
  });

  const donationsInPeriod = db.donations.length;
  res.status(200).json({ byBloodGroup, eligibleCount, donationsInPeriod });
});

app.get('/api/reports/drives', authMiddleware, requireRole('STAFF', 'ADMIN'), (req, res) => {
  const report = db.drives.map(d => {
    const totalCap = (d.slots || []).reduce((sum, s) => sum + Number(s.capacity), 0);
    const totalBooked = db.bookings.filter(b => String(b.driveId) === String(d.id) && b.status !== 'CANCELLED').length;
    const fillRate = totalCap > 0 ? (totalBooked / totalCap) * 100 : 0;
    return {
      driveId: d.id,
      name: d.name,
      capacity: totalCap,
      booked: totalBooked,
      fillRate
    };
  });
  res.status(200).json(report);
});

app.get('/api/audit', authMiddleware, requireRole('ADMIN'), (req, res) => {
  res.status(200).json(db.audit);
});

// Fallback 404
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

const PORT = process.env.PORT || 3000;
let serverInstance = null;

function startTdrServer(port = PORT) {
  return new Promise((resolve) => {
    serverInstance = app.listen(port, () => {
      resolve(serverInstance);
    });
  });
}

function stopTdrServer() {
  return new Promise((resolve) => {
    if (serverInstance) {
      serverInstance.close(() => resolve());
    } else {
      resolve();
    }
  });
}

if (require.main === module) {
  startTdrServer().then(() => {
    console.log(`TDR Test Server running on http://localhost:${PORT}`);
  });
}

module.exports = { app, startTdrServer, stopTdrServer };
