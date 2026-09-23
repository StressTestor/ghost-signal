// generated from tokens.json by scripts/gen.js. do not edit
#![allow(dead_code)]

use ratatui::style::Color;

pub mod dark {
    use super::Color;
    pub const VOID: Color = Color::Rgb(5, 5, 5);
    pub const SURFACE: Color = Color::Rgb(12, 12, 13);
    pub const RAISED: Color = Color::Rgb(21, 21, 23);
    pub const HAIRLINE: Color = Color::Rgb(30, 31, 33);
    pub const ETCH: Color = Color::Rgb(42, 44, 47);
    pub const TEXT: Color = Color::Rgb(238, 241, 242);
    pub const TEXT_MUTED: Color = Color::Rgb(142, 147, 150);
    pub const TEXT_FAINT: Color = Color::Rgb(58, 62, 65);
    pub const ACCENT: Color = Color::Rgb(14, 194, 36);
    pub const ACCENT_BLOOM: Color = Color::Rgb(178, 252, 186);
    pub const ACCENT_DIM: Color = Color::Rgb(37, 120, 41);
    pub const OK: Color = Color::Rgb(12, 192, 203);
    pub const WARN: Color = Color::Rgb(232, 163, 61);
    pub const DENY: Color = Color::Rgb(255, 92, 77);
    pub const BYPASS: Color = Color::Rgb(248, 9, 140);
    pub const GLITCH_A: Color = Color::Rgb(248, 9, 140);
    pub const GLITCH_B: Color = Color::Rgb(12, 192, 203);
    pub const ON_ACCENT: Color = Color::Rgb(5, 5, 5);
}

pub mod light {
    use super::Color;
    pub const VOID: Color = Color::Rgb(242, 244, 245);
    pub const SURFACE: Color = Color::Rgb(233, 236, 238);
    pub const RAISED: Color = Color::Rgb(228, 231, 233);
    pub const HAIRLINE: Color = Color::Rgb(211, 215, 218);
    pub const ETCH: Color = Color::Rgb(185, 190, 194);
    pub const TEXT: Color = Color::Rgb(11, 12, 13);
    pub const TEXT_MUTED: Color = Color::Rgb(75, 80, 84);
    pub const TEXT_FAINT: Color = Color::Rgb(176, 181, 185);
    pub const ACCENT: Color = Color::Rgb(8, 112, 26);
    pub const ACCENT_BLOOM: Color = Color::Rgb(14, 194, 36);
    pub const ACCENT_DIM: Color = Color::Rgb(198, 236, 201);
    pub const OK: Color = Color::Rgb(8, 102, 108);
    pub const WARN: Color = Color::Rgb(127, 86, 11);
    pub const DENY: Color = Color::Rgb(173, 42, 35);
    pub const BYPASS: Color = Color::Rgb(176, 6, 95);
    pub const GLITCH_A: Color = Color::Rgb(176, 6, 95);
    pub const GLITCH_B: Color = Color::Rgb(8, 102, 108);
    pub const ON_ACCENT: Color = Color::Rgb(242, 244, 245);
}

pub const SPACE: [u16; 6] = [4, 8, 12, 16, 24, 40];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Status {
    Idle,
    Working,
    Ok,
    Warn,
    Deny,
    Bypass,
    Crash,
}

impl Status {
    pub const ALL: [Status; 7] = [Status::Idle, Status::Working, Status::Ok, Status::Warn, Status::Deny, Status::Bypass, Status::Crash];

    pub fn color(self) -> Color {
        match self {
            Status::Idle => dark::TEXT_FAINT,
            Status::Working => dark::ACCENT,
            Status::Ok => dark::OK,
            Status::Warn => dark::WARN,
            Status::Deny => dark::DENY,
            Status::Bypass => dark::BYPASS,
            Status::Crash => dark::BYPASS,
        }
    }

    pub fn color_light(self) -> Color {
        match self {
            Status::Idle => light::TEXT_FAINT,
            Status::Working => light::ACCENT,
            Status::Ok => light::OK,
            Status::Warn => light::WARN,
            Status::Deny => light::DENY,
            Status::Bypass => light::BYPASS,
            Status::Crash => light::BYPASS,
        }
    }

    pub fn kaomoji(self) -> &'static str {
        match self {
            Status::Idle => "(｡◕‿↼)",
            Status::Working => "(¬‿¬)",
            Status::Ok => "(｡◕‿↼)",
            Status::Warn => "(¬_¬)",
            Status::Deny => ">:[",
            Status::Bypass => ">:D",
            Status::Crash => "XX",
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Status::Idle => "idle",
            Status::Working => "working",
            Status::Ok => "ok",
            Status::Warn => "warn",
            Status::Deny => "deny",
            Status::Bypass => "bypass",
            Status::Crash => "crash",
        }
    }
}
