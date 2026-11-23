const requestService = require('../src/modules/emergency_request/request.service');
const { setupTestDb } = require('./testHelper');
const db = require('../src/config/database');

describe('FR-08: Donor Ranking & Privacy Protection', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await db.closePool();
  });

  test('Ranks eligible donors with highest score first based on exact match, proximity, and response rate', async () => {
    // Requesting O+ RBC in Hubli
    // Donors:
    // USR-DONOR-02: O+ (Exact match 40pts), Hubli (30pts), 0.90 response (13.5pts)
    // USR-DONOR-01: O- (Compatible 20pts), Hubli (30pts), 0.95 response (14.25pts)
    const ranked = await requestService.rankEligibleDonors(
      'O+',
      'RBC',
      { city: 'Hubli', state: 'Karnataka' },
      { userId: 'USR-STAFF-01', role: 'BLOOD_BANK_STAFF' }
    );

    expect(ranked.length).toBeGreaterThan(0);
    // Highest ranked donor should have the highest match_score
    for (let i = 0; i < ranked.length - 1; i++) {
      expect(ranked[i].match_score).toBeGreaterThanOrEqual(ranked[i + 1].match_score);
    }

    // Exact match O+ donor should be ranked first
    expect(ranked[0].blood_group).toBe('O+');
    expect(ranked[0].is_exact_match).toBe(true);
  });

  test('Privacy Rule: Hospital requester NEVER receives donor phone numbers or medical history', async () => {
    const hospitalUser = {
      userId: 'USR-HOSP-01',
      role: 'HOSPITAL'
    };

    const ranked = await requestService.rankEligibleDonors(
      'O+',
      'RBC',
      { city: 'Hubli', state: 'Karnataka' },
      hospitalUser
    );

    expect(ranked.length).toBeGreaterThan(0);
    ranked.forEach(donor => {
      expect(donor.phone).toBeUndefined();
      expect(donor.medical_history).toBeUndefined();
      expect(donor.contact_phone).toBeUndefined();
    });
  });

  test('Ineligible donors are strictly excluded from ranking', async () => {
    // Insert an ineligible donor (underweight < 50 kg)
    await db.query(
      `INSERT INTO users (user_id, email, password_hash, phone, role)
       VALUES ('USR-UNDERWEIGHT', 'underweight@donor.org', 'hash', '12345', 'DONOR')`
    );
    await db.query(
      `INSERT INTO donor (donor_id, name, blood_group, age, weight, city, state)
       VALUES ('USR-UNDERWEIGHT', 'Underweight Donor', 'O+', 25, 45.0, 'Hubli', 'Karnataka')`
    );

    const ranked = await requestService.rankEligibleDonors(
      'O+',
      'RBC',
      { city: 'Hubli', state: 'Karnataka' },
      { userId: 'USR-STAFF-01', role: 'BLOOD_BANK_STAFF' }
    );

    const foundIneligible = ranked.find(d => d.donor_id === 'USR-UNDERWEIGHT');
    expect(foundIneligible).toBeUndefined();
  });
});
