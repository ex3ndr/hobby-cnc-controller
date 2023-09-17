import { isGCode } from './isGCode';
describe('isGCode', () => {
    it('should return true if the string is a valid GCode', () => {
        expect(isGCode('G00')).toBe(true);
        expect(isGCode('G1 X20 Y2.3 F200')).toBe(true);
    });
    it('should retrun false if the string is not a valid GCode', () => {
        expect(isGCode('help')).toBe(false);
        expect(isGCode('resume')).toBe(false);
    });
});