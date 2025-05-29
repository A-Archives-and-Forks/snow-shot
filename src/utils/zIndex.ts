/** Z-Index 层级集合，命名规则 ${窗口名}_${元素名} */
export const zIndexs = {
    // Main 窗口 BEGIN
    /** 功能按钮快捷键输入 */
    Main_FunctionButtonInput: 101,
    // Main 窗口 END

    // Draw 截图窗口 BEGIN
    /** 截图固定图片 */
    Draw_FixedImage: 101,
    /** 截图底图层 */
    Draw_CaptureImageLayer: 102,
    /** 截图模糊图层 */
    Draw_BlurImageLayer: 103,
    /** 截图绘制图层 */
    Draw_DrawLayer: 104,
    /** 截图绘制图层 */
    Draw_DrawCacheLayer: 105,
    /** 截图序列号工具 Mask */
    Draw_SerialNumberToolMask: 106,
    /** 截图 OCR 结果 */
    Draw_OcrResult: 107,
    /** 截图二维码扫描结果 */
    Draw_ScanQrcodeResult: 108,
    /** 截图选择图层 */
    Draw_SelectLayer: 109,
    /** 截图滚动截图缩略图 */
    Draw_ScrollScreenshotThumbnail: 110,

    /** 截图绘制工具层 */
    Draw_BaseTool: 200,
    /** 截图绘制光标 */
    Draw_Cursor: 201,
    /** 截图状态栏 */
    Draw_StatusBar: 202,
    /** 截图颜色选择器 */
    Draw_ColorPicker: 203,
    /** 截图选区大小工具栏 */
    Draw_ResizeToolbar: 204,
    /** 截图绘制工具栏 */
    Draw_Toolbar: 205,
    /** 截图绘制子工具栏 */
    Draw_SubToolbar: 206,
    /** 截图绘制 Excalidraw 工具栏 */
    Draw_ExcalidrawToolbar: 207,
    /** 截图绘制工具栏 hover 状态 */
    Draw_ToolbarHover: 208,

    // Draw 截图窗口 END

    // FullscreenDraw 全屏截图窗口 BEGIN
    /** 全屏截图绘制图层 */
    FullScreenDraw_DrawLayer: 0,
    /** 全屏截图绘制图层 */
    FullScreenDraw_LayoutMenu: 1,
    // FullscreenDraw 全屏截图窗口 END
};
