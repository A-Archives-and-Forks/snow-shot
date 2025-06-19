export enum VideoRecordState {
    Idle,
    Recording,
    Paused,
}

export const getVideoRecordParams = () => {
    const urlParams = new URLSearchParams(window.location.search);

    const monitorInfo = {
        monitor_x: parseInt(urlParams.get('monitor_x') ?? '0'),
        monitor_y: parseInt(urlParams.get('monitor_y') ?? '0'),
        monitor_width: parseInt(urlParams.get('monitor_width') ?? '0'),
        monitor_height: parseInt(urlParams.get('monitor_height') ?? '0'),
        monitor_scale_factor: parseFloat(urlParams.get('monitor_scale_factor') ?? '1'),
        mouse_x: 0,
        mouse_y: 0,
    };

    const selectRect = {
        min_x: parseInt(urlParams.get('select_rect_min_x') ?? '0'),
        min_y: parseInt(urlParams.get('select_rect_min_y') ?? '0'),
        max_x: parseInt(urlParams.get('select_rect_max_x') ?? '0'),
        max_y: parseInt(urlParams.get('select_rect_max_y') ?? '0'),
    };

    return {
        monitorInfo,
        selectRect,
    };
};
