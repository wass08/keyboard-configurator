// Meters. The keyboard center is 19cm behind the front edge; its front clearance
// is about 11cm, leaving room for wrists without putting it in the desk's middle.
export const DESK_TOP = 0.75;
export const DESK_CENTER_Z = -0.185;
export const DESK_FRONT_Z = DESK_CENTER_Z + 0.375;
export const CASE_BOTTOM = -0.030;
export const CASE_TILT = 7 * Math.PI / 180;
export const FOOT_THICKNESS = 0.0014;
export const MAT_THICKNESS = 0.004;
export const MAT_TOP = DESK_TOP + MAT_THICKNESS;
export const MAT_CENTER_Z = -0.04;
// The sloping local bottom becomes horizontal after the assembly root tilt.
// Seat the actual rubber feet on the felt, rather than adding a guessed gap.
export const KEYBOARD_Y = MAT_TOP - CASE_BOTTOM * Math.cos(CASE_TILT) + FOOT_THICKNESS / 2;
