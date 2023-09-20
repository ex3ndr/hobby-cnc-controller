import { MachineError } from "../_errors";

export const CARVERA_HALT_ERRORS: { [key: number]: MachineError } = {
    [1]: 'halt_manually',
    [2]: 'home_fail',
    [3]: 'probe_fail',
    [4]: 'calibrate_fail',
    [5]: 'atc_home_fail',
    [6]: 'atc_invalid_tool_number',
    [7]: 'atc_drop_tool_fail',
    [8]: 'atc_position_occupied',
    [9]: 'spindle_overheated',
    [10]: 'soft_limit_triggered',
    [11]: 'cover_opened_when_playing',
    [12]: 'wireless_probe_dead_or_not_set',
    [13]: 'emergency_stop_button_pressed',
    [21]: 'hard_limit_triggered',
    [22]: 'x_axis_motor_error',
    [23]: 'y_axis_motor_error',
    [24]: 'z_axis_motor_error',
    [25]: 'spindle_stall',
    [26]: 'sd_card_read_fail',
    [41]: 'spindle_alarm'
}