const eligibilityService = require('../src/modules/eligibility/eligibility.service');

describe('FR-03: Donor Eligibility Evaluation', () => {
  const baseEligibleDonor = {
    donor_id: 'TEST-D-01',
    name: 'Eligible Donor',
    blood_group: 'O+',
    age: 25,
    weight: 65.0,
    last_donation_date: '2026-05-01', // more than 90 days ago
    deferral_until: null,
    medical_history: 'None. Healthy.',
    is_available: true
  };

  test('Valid donor meeting all criteria is evaluated as eligible', () => {
    const result = eligibilityService.evaluateRules(baseEligibleDonor, 'WHOLE_BLOOD');
    expect(result.is_eligible).toBe(true);
    expect(result.reasons.length).toBe(0);
  });

  describe('Age Boundary Gaps', () => {
    test('Donor aged 17 is ineligible (below min age 18)', () => {
      const donor = { ...baseEligibleDonor, age: 17 };
      const res = eligibilityService.evaluateRules(donor);
      expect(res.is_eligible).toBe(false);
      expect(res.reasons.some(r => r.includes('below minimum'))).toBe(true);
    });

    test('Donor aged exactly 18 is eligible (boundary edge)', () => {
      const donor = { ...baseEligibleDonor, age: 18 };
      const res = eligibilityService.evaluateRules(donor);
      expect(res.is_eligible).toBe(true);
    });

    test('Donor aged exactly 65 is eligible (boundary edge)', () => {
      const donor = { ...baseEligibleDonor, age: 65 };
      const res = eligibilityService.evaluateRules(donor);
      expect(res.is_eligible).toBe(true);
    });

    test('Donor aged 66 is ineligible (exceeds max age 65)', () => {
      const donor = { ...baseEligibleDonor, age: 66 };
      const res = eligibilityService.evaluateRules(donor);
      expect(res.is_eligible).toBe(false);
      expect(res.reasons.some(r => r.includes('exceeds maximum'))).toBe(true);
    });
  });

  describe('Weight Boundary Gaps', () => {
    test('Donor weighing 49.9 kg is ineligible (below 50 kg)', () => {
      const donor = { ...baseEligibleDonor, weight: 49.9 };
      const res = eligibilityService.evaluateRules(donor);
      expect(res.is_eligible).toBe(false);
      expect(res.reasons.some(r => r.includes('below minimum required weight'))).toBe(true);
    });

    test('Donor weighing exactly 50.0 kg is eligible', () => {
      const donor = { ...baseEligibleDonor, weight: 50.0 };
      const res = eligibilityService.evaluateRules(donor);
      expect(res.is_eligible).toBe(true);
    });
  });

  describe('Donation Interval Gaps', () => {
    test('Donor who donated 20 days ago is ineligible for Whole Blood (requires 90 days)', () => {
      const twentyDaysAgo = new Date();
      twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

      const donor = {
        ...baseEligibleDonor,
        last_donation_date: twentyDaysAgo.toISOString().split('T')[0]
      };
      const res = eligibilityService.evaluateRules(donor, 'WHOLE_BLOOD');
      expect(res.is_eligible).toBe(false);
      expect(res.reasons.some(r => r.includes('Minimum donation interval of 90 days not met'))).toBe(true);
      expect(res.next_eligible_date).not.toBeNull();
    });
  });

  describe('Temporary Deferral and Medical History', () => {
    test('Donor with active future deferral is ineligible', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const donor = {
        ...baseEligibleDonor,
        deferral_until: futureDate.toISOString().split('T')[0]
      };
      const res = eligibilityService.evaluateRules(donor);
      expect(res.is_eligible).toBe(false);
      expect(res.reasons.some(r => r.includes('temporarily deferred'))).toBe(true);
    });

    test('Donor with past deferral date is eligible', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);

      const donor = {
        ...baseEligibleDonor,
        deferral_until: pastDate.toISOString().split('T')[0]
      };
      const res = eligibilityService.evaluateRules(donor);
      expect(res.is_eligible).toBe(true);
    });

    test('Donor with medical disqualifier (hepatitis) is rejected', () => {
      const donor = {
        ...baseEligibleDonor,
        medical_history: 'Diagnosed with chronic hepatitis B'
      };
      const res = eligibilityService.evaluateRules(donor);
      expect(res.is_eligible).toBe(false);
      expect(res.reasons.some(r => r.includes('Disqualifying medical condition'))).toBe(true);
    });
  });
});
