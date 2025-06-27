import { createPublisher } from '@/hooks/useStatePublisher';

export const EnableKeyEventPublisher = createPublisher<boolean>(false);

export type KeyEventValue = {
    hotKey: string;
    unique?: boolean;
};

export type KeyEventComponentValue = KeyEventValue & {
    messageId: string;
};

export enum KeyEventKey {
    MoveTool = 'moveTool',
    SelectTool = 'selectTool',
    LockDrawTool = 'lockDrawTool',
    RectTool = 'rectTool',
    EllipseTool = 'ellipseTool',
    ArrowTool = 'arrowTool',
    PenTool = 'penTool',
    // HighlightTool = 'highlightTool',
    BlurTool = 'blurTool',
    TextTool = 'textTool',
    SerialNumberTool = 'serialNumberTool',
    EraserTool = 'eraserTool',
    UndoTool = 'undoTool',
    RedoTool = 'redoTool',
    CancelTool = 'cancelTool',
    RemoveTool = 'removeTool',
    ColorPickerCopy = 'colorPickerCopy',
    SaveTool = 'saveTool',
    FastSaveTool = 'fastSaveTool',
    ScrollScreenshotTool = 'scrollScreenshotTool',
    CopyTool = 'copyTool',
    FixedTool = 'fixedTool',
    OcrDetectTool = 'ocrDetectTool',
    ColorPickerMoveUp = 'colorPickerMoveUp',
    ColorPickerMoveDown = 'colorPickerMoveDown',
    ColorPickerMoveLeft = 'colorPickerMoveLeft',
    ColorPickerMoveRight = 'colorPickerMoveRight',
    ResizeFromCenterPicker = 'resizeFromCenterPicker',
    SerialNumberDisableArrow = 'serialNumberDisableArrow',
    MaintainAspectRatioPicker = 'maintainAspectRatioPicker',
    RotateWithDiscreteAnglePicker = 'rotateWithDiscreteAnglePicker',
    AutoAlignPicker = 'autoAlignPicker',
    SwitchColorFormat = 'switchColorFormat',
    ExtraToolsTool = 'extraToolsTool',
    SelectPrevRectTool = 'selectPrevRectTool',
    LaserPointerTool = 'laserPointerTool',
}

export const defaultDrawToolbarKeyEventSettings: Record<KeyEventKey, KeyEventValue> = {
    [KeyEventKey.MoveTool]: {
        hotKey: 'M',
        unique: true,
    },
    [KeyEventKey.SelectTool]: {
        hotKey: 'V',
        unique: true,
    },
    [KeyEventKey.LockDrawTool]: {
        hotKey: 'Ctrl+L',
        unique: true,
    },
    [KeyEventKey.RectTool]: {
        hotKey: '1',
        unique: true,
    },
    [KeyEventKey.EllipseTool]: {
        hotKey: '2',
        unique: true,
    },
    [KeyEventKey.ArrowTool]: {
        hotKey: '3',
        unique: true,
    },
    [KeyEventKey.PenTool]: {
        hotKey: '4',
        unique: true,
    },
    [KeyEventKey.TextTool]: {
        hotKey: '5, T',
        unique: true,
    },
    [KeyEventKey.SerialNumberTool]: {
        hotKey: '6',
        unique: true,
    },
    [KeyEventKey.BlurTool]: {
        hotKey: '7',
        unique: true,
    },
    [KeyEventKey.EraserTool]: {
        hotKey: '8, E',
        unique: true,
    },
    [KeyEventKey.UndoTool]: {
        hotKey: 'Ctrl+Z',
        unique: true,
    },
    [KeyEventKey.RedoTool]: {
        hotKey: 'Ctrl+Y',
        unique: true,
    },
    [KeyEventKey.CancelTool]: {
        hotKey: 'Escape',
        unique: true,
    },
    [KeyEventKey.FixedTool]: {
        hotKey: 'Ctrl+F',
        unique: true,
    },
    [KeyEventKey.CopyTool]: {
        hotKey: 'Ctrl+C',
        unique: true,
    },
    [KeyEventKey.ExtraToolsTool]: {
        hotKey: 'Ctrl+E',
        unique: true,
    },
    [KeyEventKey.OcrDetectTool]: {
        hotKey: 'Ctrl+D',
        unique: true,
    },
    [KeyEventKey.ScrollScreenshotTool]: {
        hotKey: 'L',
        unique: true,
    },
    [KeyEventKey.SaveTool]: {
        hotKey: 'Ctrl+S',
        unique: true,
    },
    [KeyEventKey.FastSaveTool]: {
        hotKey: 'Ctrl+Shift+S',
        unique: true,
    },
    [KeyEventKey.ColorPickerCopy]: {
        hotKey: 'C',
        unique: true,
    },
    [KeyEventKey.SerialNumberDisableArrow]: {
        hotKey: 'Shift',
    },
    [KeyEventKey.ResizeFromCenterPicker]: {
        hotKey: 'Alt',
    },
    [KeyEventKey.MaintainAspectRatioPicker]: {
        hotKey: 'Shift',
    },
    [KeyEventKey.RotateWithDiscreteAnglePicker]: {
        hotKey: 'Shift',
    },
    [KeyEventKey.SwitchColorFormat]: {
        hotKey: 'Shift',
    },
    [KeyEventKey.AutoAlignPicker]: {
        hotKey: 'Control',
        unique: true,
    },
    [KeyEventKey.RemoveTool]: {
        hotKey: 'Delete',
        unique: true,
    },
    [KeyEventKey.SelectPrevRectTool]: {
        hotKey: 'R',
        unique: true,
    },
    [KeyEventKey.ColorPickerMoveUp]: {
        hotKey: 'W, ArrowUp',
        unique: true,
    },
    [KeyEventKey.ColorPickerMoveDown]: {
        hotKey: 'S, ArrowDown',
        unique: true,
    },
    [KeyEventKey.ColorPickerMoveLeft]: {
        hotKey: 'A, ArrowLeft',
        unique: true,
    },
    [KeyEventKey.ColorPickerMoveRight]: {
        hotKey: 'D, ArrowRight',
        unique: true,
    },
    [KeyEventKey.LaserPointerTool]: {
        hotKey: 'Ctrl+L',
        unique: true,
    },
};

const keyEventSettingsKeys = Object.keys(defaultDrawToolbarKeyEventSettings);
export const defaultDrawToolbarKeyEventComponentConfig: Record<
    KeyEventKey,
    KeyEventComponentValue
> = keyEventSettingsKeys.reduce(
    (acc, key) => {
        acc[key as KeyEventKey] = {
            ...defaultDrawToolbarKeyEventSettings[key as KeyEventKey],
            messageId: `draw.${key}`,
        };
        return acc;
    },
    {} as Record<KeyEventKey, KeyEventComponentValue>,
);
