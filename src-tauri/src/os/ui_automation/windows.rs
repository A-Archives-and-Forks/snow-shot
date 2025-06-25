use std::cmp::Ordering;
use std::collections::HashMap;
use std::mem;

use crate::app_error::AutomationError;
use atree::Arena;
use atree::Token;
use rtree_rs::{RTree, Rect};
use serde::Deserialize;
use serde::Serialize;
use std::thread::sleep;
use std::time::Duration;
use tauri::Emitter;
use uiautomation::UIAutomation;
use uiautomation::UIElement;
use uiautomation::UITreeWalker;
use uiautomation::types::Point;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::GetClassNameW;
use xcap::Window;

use super::ElementRect;

/**
 * 元素层级
 */
#[derive(Debug, Clone, PartialEq, Eq, Hash, Copy, PartialOrd)]
pub struct ElementLevel {
    /**
     * 遍历时，首先获得层级最高的元素
     * 同级元素，index 越高，层级越低
     */
    pub element_index: i32,
    /**
     * 元素层级
     */
    pub element_level: i32,
    /**
     * 父元素索引
     */
    pub parent_index: i32,
    /**
     * 窗口索引
     */
    pub window_index: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Copy, PartialOrd, Serialize, Deserialize)]
pub enum TryGetElementByFocus {
    /// 从不
    Never,
    /// 仅针对 Firefox 浏览器
    Firefox,
    /// 尝试在白名单中获取焦点
    WhiteList,
    /// 总是尝试获取焦点
    Always,
}

impl ElementLevel {
    pub fn min() -> Self {
        Self {
            element_index: 0,
            element_level: 0,
            parent_index: 0,
            window_index: i32::MAX,
        }
    }

    pub fn next_level(&mut self) {
        self.element_level += 1;
        let current_element_index = self.element_index;
        self.element_index = 0;
        self.parent_index = current_element_index;
    }

    pub fn next_element(&mut self) {
        self.element_index += 1;
    }
}

impl Ord for ElementLevel {
    fn cmp(&self, other: &Self) -> Ordering {
        // 先窗口索引排序，窗口索引小的优先级越高
        if self.window_index != other.window_index {
            return other.window_index.cmp(&self.window_index);
        }

        // 元素层级排序，层级高的优先级越高
        if self.element_level != other.element_level {
            return self.element_level.cmp(&other.element_level);
        }

        // 元素索引排序，索引小的优先级越高
        if self.element_index != other.element_index {
            return other.element_index.cmp(&self.element_index);
        }

        // 父元素索引排序，索引大的优先级越高
        other.parent_index.cmp(&self.parent_index)
    }
}

pub struct UIElements {
    automation: Option<UIAutomation>,
    automation_walker: Option<UITreeWalker>,
    root_element: Option<UIElement>,
    element_cache: RTree<2, i32, ElementLevel>,
    element_level_map: HashMap<ElementLevel, (UIElement, Token)>,
    element_rect_tree: Arena<uiautomation::types::Rect>,
    monitor_rect: ElementRect,
    element_children_next_sibling_cache: HashMap<ElementLevel, Option<(UIElement, ElementLevel)>>,
    window_rect_map: HashMap<i32, uiautomation::types::Rect>,
    window_focus_count_map: HashMap<i32, i32>,
    try_get_element_by_focus: TryGetElementByFocus,
}

unsafe impl Send for UIElements {}
unsafe impl Sync for UIElements {}

impl UIElements {
    pub fn new() -> Self {
        Self {
            automation: None,
            automation_walker: None,
            root_element: None,
            element_rect_tree: Arena::new(),
            element_cache: RTree::new(),
            element_level_map: HashMap::new(),
            monitor_rect: ElementRect {
                min_x: 0,
                min_y: 0,
                max_x: 0,
                max_y: 0,
            },
            element_children_next_sibling_cache: HashMap::new(),
            window_rect_map: HashMap::new(),
            window_focus_count_map: HashMap::new(),
            try_get_element_by_focus: TryGetElementByFocus::Always,
        }
    }

    pub fn init(&mut self) -> Result<(), AutomationError> {
        if self.automation.is_some() && self.automation_walker.is_some() {
            return Ok(());
        }

        let automation = UIAutomation::new()?;
        let automation_walker = automation.get_content_view_walker()?;
        let root_element = automation.get_root_element()?;

        self.automation = Some(automation);
        self.automation_walker = Some(automation_walker);
        self.root_element = Some(root_element);

        Ok(())
    }

    pub fn convert_element_rect_to_rtree_rect(rect: uiautomation::types::Rect) -> Rect<2, i32> {
        Rect::new(
            [rect.get_left(), rect.get_top()],
            [rect.get_right(), rect.get_bottom()],
        )
    }

    fn normalize_rect(rect: uiautomation::types::Rect) -> uiautomation::types::Rect {
        // 当前矩形的数据不可信，做个纠正
        let mut rect_left = rect.get_left();
        let mut rect_top = rect.get_top();
        let mut rect_right = rect.get_right();
        let mut rect_bottom = rect.get_bottom();

        if rect_left > rect_right {
            mem::swap(&mut rect_left, &mut rect_right);
        }

        if rect_top > rect_bottom {
            mem::swap(&mut rect_top, &mut rect_bottom);
        }

        uiautomation::types::Rect::new(rect_left, rect_top, rect_right, rect_bottom)
    }

    fn beyond_rect(
        rect: uiautomation::types::Rect,
        parent_rect: uiautomation::types::Rect,
    ) -> bool {
        if rect.get_left() < parent_rect.get_left() {
            return true;
        }

        if rect.get_right() > parent_rect.get_right() {
            return true;
        }

        if rect.get_top() < parent_rect.get_top() {
            return true;
        }

        if rect.get_bottom() > parent_rect.get_bottom() {
            return true;
        }

        false
    }

    pub fn clip_rect(
        rect: uiautomation::types::Rect,
        parent_rect: uiautomation::types::Rect,
    ) -> uiautomation::types::Rect {
        uiautomation::types::Rect::new(
            rect.get_left().max(parent_rect.get_left()),
            rect.get_top().max(parent_rect.get_top()),
            rect.get_right().min(parent_rect.get_right()),
            rect.get_bottom().min(parent_rect.get_bottom()),
        )
    }

    /**
     * 初始化窗口元素缓存
     */
    pub fn init_cache(
        &mut self,
        monitor_rect: ElementRect,
        try_get_element_by_focus: TryGetElementByFocus,
    ) -> Result<(), AutomationError> {
        self.try_get_element_by_focus = try_get_element_by_focus;
        self.monitor_rect = monitor_rect;

        let root_element = self.root_element.clone().unwrap();

        self.element_cache = RTree::new();
        self.element_level_map.clear();
        self.element_rect_tree = Arena::new();
        self.element_children_next_sibling_cache.clear();
        self.window_rect_map.clear();
        self.window_focus_count_map.clear();

        self.try_get_element_by_focus = try_get_element_by_focus;

        // 桌面的窗口索引应该是最高，因为其优先级最低
        let mut current_level = ElementLevel::min();
        let root_element_rect = uiautomation::types::Rect::new(
            self.monitor_rect.min_x,
            self.monitor_rect.min_y,
            self.monitor_rect.max_x,
            self.monitor_rect.max_y,
        );

        let root_tree_token = self.element_rect_tree.new_node(root_element_rect);
        let (_, parent_tree_token) = self.insert_element_cache(
            root_element.clone(),
            root_element_rect,
            current_level,
            root_tree_token,
        );

        // 遍历所有窗口
        let windows = Window::all().unwrap_or_default();

        let automation = self.automation.as_ref().unwrap();
        let mut children_list: Vec<(UIElement, bool)> = Vec::with_capacity(windows.len());

        for window in windows {
            if window.is_minimized().unwrap_or(true) {
                continue;
            }

            let mut disable_focus = false;

            let window_title = match window.title() {
                Ok(title) => {
                    if title.eq("Shell Handwriting Canvas") || title.eq("Snow Shot - Draw") {
                        continue;
                    }

                    title
                }
                Err(_) => continue,
            };

            let window_hwnd = window.hwnd();

            match window_hwnd {
                Ok(hwnd) => {
                    if let Ok(element) = automation
                        .element_from_handle(uiautomation::types::Handle::from(hwnd as isize))
                    {
                        match self.try_get_element_by_focus {
                            TryGetElementByFocus::Never => {
                                disable_focus = true;
                            }
                            TryGetElementByFocus::Firefox => {
                                if window_title.ends_with("Mozilla Firefox") {
                                    disable_focus = false;
                                } else {
                                    disable_focus = true;
                                }
                            }
                            TryGetElementByFocus::WhiteList => {
                                if window_title.ends_with("Mozilla Firefox")
                                    || window_title.ends_with("Microsoft​ Edge")
                                    || window_title.ends_with("Microsoft Edge")
                                    || window_title.ends_with("Google Chrome")
                                    || window_title.starts_with("Snow Shot")
                                {
                                    disable_focus = false;
                                } else {
                                    disable_focus = true;
                                }
                            }
                            TryGetElementByFocus::Always => {
                                disable_focus = false;

                                let mut class_name = [0u16; 256];
                                let class_name_len =
                                    unsafe { GetClassNameW(HWND(hwnd), &mut class_name) };

                                // 任务栏能正常获取元素，禁用焦点选择防止闪烁
                                if String::from_utf16_lossy(&class_name[..class_name_len as usize])
                                    .eq("Shell_TrayWnd")
                                {
                                    disable_focus = true;
                                }
                            }
                        }

                        children_list.push((element, disable_focus));
                    }
                }
                Err(_) => {}
            }
        }

        // 最后获取桌面的 hwnd
        // unsafe {
        //     let program_manager_hwnd = FindWindowW(
        //         windows::core::w!("Progman"),
        //         windows::core::w!("Program Manager"),
        //     );
        //     if let Ok(hwnd) = program_manager_hwnd {
        //         if let Ok(element) = automation
        //             .element_from_handle(uiautomation::types::Handle::from(hwnd.0 as isize))
        //         {
        //             children_list.push(element);
        //         }
        //     }
        // }

        // 窗口层级
        current_level.window_index = 0;
        current_level.next_level();

        for (current_child, disable_focus) in children_list {
            current_level.window_index += 1;
            current_level.next_element();

            let current_child_rect = current_child.get_bounding_rectangle()?;
            self.insert_element_cache(
                current_child.clone(),
                current_child_rect,
                current_level,
                parent_tree_token,
            );

            self.window_rect_map
                .insert(current_level.window_index, current_child_rect);

            if disable_focus {
                self.window_focus_count_map
                    .insert(current_level.window_index, 999);
            }
        }

        Ok(())
    }

    pub fn get_element_from_point(
        &self,
        mouse_x: i32,
        mouse_y: i32,
    ) -> Result<Option<ElementRect>, AutomationError> {
        let automation = match self.automation.as_ref() {
            Some(automation) => automation,
            None => return Ok(None),
        };

        let element = automation.element_from_point(Point::new(mouse_x, mouse_y))?;
        let rect = element.get_bounding_rectangle()?;

        Ok(Some(ElementRect {
            min_x: rect.get_left(),
            min_y: rect.get_top(),
            max_x: rect.get_right(),
            max_y: rect.get_bottom(),
        }))
    }

    pub fn insert_element_cache(
        &mut self,
        element: UIElement,
        element_rect: uiautomation::types::Rect,
        element_level: ElementLevel,
        parent_tree_token: Token,
    ) -> (uiautomation::types::Rect, Token) {
        let element_rect = uiautomation::types::Rect::new(
            element_rect.get_left() - self.monitor_rect.min_x,
            element_rect.get_top() - self.monitor_rect.min_y,
            element_rect.get_right() - self.monitor_rect.min_x,
            element_rect.get_bottom() - self.monitor_rect.min_y,
        );

        let mut element_rect = Self::normalize_rect(element_rect);
        let window_rect = self
            .window_rect_map
            .get(&element_level.window_index)
            .unwrap_or(&element_rect)
            .clone();
        if Self::beyond_rect(element_rect, window_rect) {
            element_rect = Self::clip_rect(element_rect, window_rect);
        }

        self.element_cache.insert(
            Self::convert_element_rect_to_rtree_rect(element_rect),
            element_level,
        );

        let current_node = self.element_rect_tree.new_node(element_rect);
        parent_tree_token
            .append_node(&mut self.element_rect_tree, current_node)
            .unwrap();
        self.element_level_map
            .insert(element_level, (element, current_node));

        (element_rect, current_node)
    }

    fn get_element_from_cache(
        &self,
        mouse_x: i32,
        mouse_y: i32,
    ) -> Option<(UIElement, ElementLevel, uiautomation::types::Rect, Token)> {
        let element_rect = self
            .element_cache
            .search(Rect::new_point([mouse_x, mouse_y]));

        // 获取层级最高的元素
        let mut max_level = ElementLevel::min();
        let mut max_level_rect = None;
        for rect in element_rect {
            if max_level.cmp(&rect.data) == Ordering::Less {
                max_level = rect.data.clone();
                max_level_rect = Some(rect.rect);
            }
        }
        let element_rtree_rect = match max_level_rect {
            Some(rect) => {
                uiautomation::types::Rect::new(rect.min[0], rect.min[1], rect.max[0], rect.max[1])
            }
            None => return None,
        };

        match self.element_level_map.get(&max_level) {
            Some((element, token)) => {
                Some((element.clone(), max_level, element_rtree_rect, *token))
            }
            None => None,
        }
    }

    fn get_first_child(
        &mut self,
        element: &UIElement,
        level: &ElementLevel,
        app_window: &tauri::Window,
    ) -> Result<UIElement, uiautomation::Error> {
        let automation_walker = self.automation_walker.as_mut().unwrap();

        let mut first_child = automation_walker.get_first_child(element);
        if first_child.is_err() && self.try_get_element_by_focus != TryGetElementByFocus::Never {
            let focus_count = self
                .window_focus_count_map
                .entry(level.window_index)
                .or_insert(0);

            // 像浏览器可能首次获取会失败，这里多试几次
            let mut try_count = 0;
            while *focus_count < 3 * 4 && try_count < 3 {
                if element.try_focus() {
                    // 交给前端节流处理，避免焦点快速切换
                    let _ = app_window.emit("ui-automation-try-focus", ());

                    sleep(Duration::from_millis(32));
                    first_child = automation_walker.get_first_child(element);
                }

                *focus_count += 1;
                try_count += 1;
            }
        }

        first_child
    }

    /**
     * 获取所有可选区域
     */
    pub fn get_element_from_point_walker(
        &mut self,
        mouse_x: i32,
        mouse_y: i32,
        app_window: &tauri::Window,
    ) -> Result<Vec<ElementRect>, AutomationError> {
        let automation_walker = self.automation_walker.clone().unwrap();
        let (parent_element, mut parent_level, parent_rect, mut parent_tree_token) = match self
            .get_element_from_cache(
                mouse_x - self.monitor_rect.min_x,
                mouse_y - self.monitor_rect.min_y,
            ) {
            Some(element) => element,
            None => (
                self.root_element.clone().unwrap(),
                ElementLevel::min(),
                uiautomation::types::Rect::new(0, 0, i32::MAX, i32::MAX),
                self.element_rect_tree
                    .new_node(uiautomation::types::Rect::new(0, 0, i32::MAX, i32::MAX)),
            ),
        };

        // 父元素必然命中了 mouse position，所以直接取第一个元素
        let mut current_level = ElementLevel::min();

        let mut queue = Option::<UIElement>::None;

        // let mut cache_level = Option::<ElementLevel>::None;
        match self.element_children_next_sibling_cache.get(&parent_level) {
            Some(element) => match element {
                Some((element, level)) => {
                    queue = Some(element.clone());
                    current_level = level.clone();
                }
                None => {}
            },
            None => {
                // 这里主动获取下，这时写入了缓存，但没有符合上一次的筛选条件
                let first_child = self.get_first_child(&parent_element, &parent_level, app_window);
                match first_child {
                    Ok(element) => {
                        queue = Some(element.clone());
                        current_level = parent_level.clone();
                        current_level.next_level();

                        self.element_children_next_sibling_cache
                            .insert(parent_level, Some((element, current_level)));

                        // cache_level = Some(parent_level.clone());
                        // cache_level.as_mut().unwrap().next_level();

                        // self.element_children_next_sibling_cache
                        //     .insert(parent_level, Some((element, cache_level.as_ref().unwrap().clone())));
                    }
                    Err(_) => {
                        self.element_children_next_sibling_cache
                            .insert(parent_level, None);
                    }
                }
            }
        };

        // let mut first_child_level = Option::<ElementLevel>::None;
        // let first_child = automation_walker.get_first_child(&self.element_level_map.get(&parent_level).unwrap().0);
        // match first_child {
        //     Ok(element) => {
        //         queue = Some(element.clone());
        //         current_level = parent_level.clone();
        //         current_level.next_level();

        //         // first_child_level = Some(current_level.clone());
        //     }
        //     Err(_) => {}
        // }

        // if cache_level != first_child_level {
        //     println!("cache_level: {:?} first_child_level: {:?} parent_level: {:?}", cache_level, first_child_level, parent_level);
        // }

        let mut current_element_rect = parent_rect;
        let mut current_element_token = parent_tree_token;
        let mut result_token = current_element_token;
        let mut result_rect = current_element_rect;

        while let Some(current_element) = queue.take() {
            queue = None;

            current_element_rect = match current_element.get_bounding_rectangle() {
                Ok(rect) => rect,
                Err(_) => continue,
            };

            let current_element_left = current_element_rect.get_left();
            let current_element_right = current_element_rect.get_right();
            let current_element_top = current_element_rect.get_top();
            let current_element_bottom = current_element_rect.get_bottom();

            if !(current_element_left == 0
                && current_element_right == 0
                && current_element_top == 0
                && current_element_bottom == 0)
            {
                (current_element_rect, current_element_token) = self.insert_element_cache(
                    current_element.clone(),
                    current_element_rect,
                    current_level,
                    parent_tree_token,
                );

                if current_element_left <= mouse_x
                    && current_element_right >= mouse_x
                    && current_element_top <= mouse_y
                    && current_element_bottom >= mouse_y
                {
                    result_token = current_element_token;
                    result_rect = current_element_rect;

                    let first_child =
                        self.get_first_child(&current_element, &current_level, app_window);
                    if let Ok(child) = first_child {
                        queue = Some(child.clone());
                        parent_tree_token = current_element_token;
                        parent_level = current_level;

                        current_level.next_level();

                        self.element_children_next_sibling_cache
                            .insert(parent_level, Some((child, current_level)));

                        continue;
                    } else {
                        self.element_children_next_sibling_cache
                            .insert(current_level, None);
                    }
                }
            }

            let next_sibling = automation_walker.get_next_sibling(&current_element);
            match next_sibling {
                Ok(sibling) => {
                    queue = Some(sibling.clone());
                    current_level.next_element();

                    self.element_children_next_sibling_cache
                        .insert(parent_level, Some((sibling, current_level)));
                }
                Err(_) => {
                    self.element_children_next_sibling_cache
                        .insert(parent_level, None);
                }
            }
        }

        let element_ancestors = result_token.ancestors(&self.element_rect_tree);
        let mut result_rect_list = Vec::with_capacity(16);
        let mut previous_rect = ElementRect::from(result_rect);
        result_rect_list.push(previous_rect);
        for node in element_ancestors {
            let current_rect = ElementRect::from(node.data);
            if current_rect == previous_rect {
                continue;
            }

            if current_rect.min_x == previous_rect.max_x
                || current_rect.min_y == previous_rect.max_y
                || current_rect.min_x > previous_rect.max_x
                || current_rect.min_y > previous_rect.max_y
            {
                continue;
            }

            result_rect_list.push(current_rect);
            previous_rect = current_rect;
        }

        return Ok(result_rect_list);
    }
}

impl Drop for UIElements {
    fn drop(&mut self) {
        // 清理资源
        self.automation = None;
        self.automation_walker = None;
        self.root_element = None;
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use device_query::{DeviceEvents, DeviceEventsHandler};
    use uiautomation::types::Point;

    use super::*;

    #[test]
    fn test_get_element_from_point() {
        let device_state = DeviceEventsHandler::new(Duration::from_millis(1000 / 60))
            .expect("Failed to start event loop");

        // Register a key down event callback
        // The guard is used to keep the callback alive
        let _guard = device_state.on_mouse_move(|position| {
            let (mouse_x, mouse_y) = position;

            let automation = UIAutomation::new().unwrap();
            let element = match automation.element_from_point(Point::new(*mouse_x, *mouse_y)) {
                Ok(element) => element,
                Err(_) => return,
            };

            let rect = match element.get_bounding_rectangle() {
                Ok(rect) => rect,
                Err(_) => return,
            };

            println!(
                "element: left {}, top {}, width {}, height {}",
                rect.get_left(),
                rect.get_top(),
                rect.get_width(),
                rect.get_height()
            );
        });

        loop {}
    }
}
