const compatibilityService = require('../src/modules/compatibility/compatibility.service');

describe('FR-07: Blood Compatibility Rules & Matrices', () => {
  describe('RBC & Whole Blood Compatibility', () => {
    test('Universal RBC Donor: O- can donate to all blood groups', () => {
      const allGroups = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
      allGroups.forEach(recipient => {
        expect(compatibilityService.checkCompatibility('O-', recipient, 'RBC')).toBe(true);
        expect(compatibilityService.checkCompatibility('O-', recipient, 'WHOLE_BLOOD')).toBe(true);
      });
    });

    test('Universal RBC Recipient: AB+ can receive from all blood groups', () => {
      const allGroups = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
      allGroups.forEach(donor => {
        expect(compatibilityService.checkCompatibility(donor, 'AB+', 'RBC')).toBe(true);
      });
    });

    test('Incompatible RBC matches are strictly rejected', () => {
      // A+ cannot give to B+
      expect(compatibilityService.checkCompatibility('A+', 'B+', 'RBC')).toBe(false);
      // B+ cannot give to A-
      expect(compatibilityService.checkCompatibility('B+', 'A-', 'RBC')).toBe(false);
      // Rh+ cannot give to Rh-
      expect(compatibilityService.checkCompatibility('O+', 'O-', 'RBC')).toBe(false);
      expect(compatibilityService.checkCompatibility('A+', 'A-', 'RBC')).toBe(false);
    });
  });

  describe('Plasma Compatibility Matrix (Separate from RBC)', () => {
    test('Universal Plasma Donor: AB can donate plasma to all ABO recipients', () => {
      expect(compatibilityService.checkCompatibility('AB+', 'O+', 'PLASMA')).toBe(true);
      expect(compatibilityService.checkCompatibility('AB-', 'A+', 'PLASMA')).toBe(true);
      expect(compatibilityService.checkCompatibility('AB+', 'B-', 'PLASMA')).toBe(true);
      expect(compatibilityService.checkCompatibility('AB+', 'AB+', 'PLASMA')).toBe(true);
    });

    test('O blood group cannot donate plasma to AB (Anti-A and Anti-B antibodies present in O plasma)', () => {
      // O recipient can receive plasma from AB, but AB recipient CANNOT receive plasma from O
      expect(compatibilityService.checkCompatibility('O+', 'AB+', 'PLASMA')).toBe(false);
      expect(compatibilityService.checkCompatibility('O-', 'A+', 'PLASMA')).toBe(false);
    });
  });

  describe('Input Validation & Error Handling', () => {
    test('Throws error on invalid blood group', () => {
      expect(() => {
        compatibilityService.checkCompatibility('INVALID_BG', 'A+', 'RBC');
      }).toThrow('Invalid donor blood group');

      expect(() => {
        compatibilityService.checkCompatibility('O+', 'XYZ', 'RBC');
      }).toThrow('Invalid recipient blood group');
    });

    test('Throws error on invalid component', () => {
      expect(() => {
        compatibilityService.checkCompatibility('O+', 'O+', 'UNKNOWN_COMP');
      }).toThrow('Invalid component');
    });
  });
});
