export type MachineError =
    'halt_manually' |
    'home_fail' |
    'probe_fail' |
    'calibrate_fail' |
    'atc_home_fail' |
    'atc_invalid_tool_number' |
    'atc_drop_tool_fail' |
    'atc_position_occupied' |
    'spindle_overheated' |
    'soft_limit_triggered' |
    'cover_opened_when_playing' |
    'wireless_probe_dead_or_not_set' |
    'emergency_stop_button_pressed' |
    'hard_limit_triggered' |
    'x_axis_motor_error' |
    'y_axis_motor_error' |
    'z_axis_motor_error' |
    'spindle_stall' |
    'sd_card_read_fail' |
    'spindle_alarm';