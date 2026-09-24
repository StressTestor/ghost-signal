// generated from tokens.json by scripts/gen.js. do not edit
import SwiftUI

public enum GhostSignal {
    public struct Theme {
        public let void: Color
        public let surface: Color
        public let raised: Color
        public let hairline: Color
        public let etch: Color
        public let text: Color
        public let textMuted: Color
        public let textFaint: Color
        public let accent: Color
        public let accentBloom: Color
        public let accentDim: Color
        public let ok: Color
        public let warn: Color
        public let deny: Color
        public let bypass: Color
        public let glitchA: Color
        public let glitchB: Color
        public let onAccent: Color
    }

    public static let dark = Theme(
        void: Color(.sRGB, red: 0.0196, green: 0.0196, blue: 0.0196, opacity: 1),
        surface: Color(.sRGB, red: 0.0471, green: 0.0471, blue: 0.0510, opacity: 1),
        raised: Color(.sRGB, red: 0.0824, green: 0.0824, blue: 0.0902, opacity: 1),
        hairline: Color(.sRGB, red: 0.1176, green: 0.1216, blue: 0.1294, opacity: 1),
        etch: Color(.sRGB, red: 0.1647, green: 0.1725, blue: 0.1843, opacity: 1),
        text: Color(.sRGB, red: 0.9333, green: 0.9451, blue: 0.9490, opacity: 1),
        textMuted: Color(.sRGB, red: 0.5569, green: 0.5765, blue: 0.5882, opacity: 1),
        textFaint: Color(.sRGB, red: 0.2275, green: 0.2431, blue: 0.2549, opacity: 1),
        accent: Color(.sRGB, red: 0.0549, green: 0.7608, blue: 0.1412, opacity: 1),
        accentBloom: Color(.sRGB, red: 0.6980, green: 0.9882, blue: 0.7294, opacity: 1),
        accentDim: Color(.sRGB, red: 0.1451, green: 0.4706, blue: 0.1608, opacity: 1),
        ok: Color(.sRGB, red: 0.0471, green: 0.7529, blue: 0.7961, opacity: 1),
        warn: Color(.sRGB, red: 0.9098, green: 0.6392, blue: 0.2392, opacity: 1),
        deny: Color(.sRGB, red: 1.0000, green: 0.3608, blue: 0.3020, opacity: 1),
        bypass: Color(.sRGB, red: 0.9725, green: 0.0353, blue: 0.5490, opacity: 1),
        glitchA: Color(.sRGB, red: 0.9725, green: 0.0353, blue: 0.5490, opacity: 1),
        glitchB: Color(.sRGB, red: 0.0471, green: 0.7529, blue: 0.7961, opacity: 1),
        onAccent: Color(.sRGB, red: 0.0196, green: 0.0196, blue: 0.0196, opacity: 1)
    )

    public static let light = Theme(
        void: Color(.sRGB, red: 0.9490, green: 0.9569, blue: 0.9608, opacity: 1),
        surface: Color(.sRGB, red: 0.9137, green: 0.9255, blue: 0.9333, opacity: 1),
        raised: Color(.sRGB, red: 0.8941, green: 0.9059, blue: 0.9137, opacity: 1),
        hairline: Color(.sRGB, red: 0.8275, green: 0.8431, blue: 0.8549, opacity: 1),
        etch: Color(.sRGB, red: 0.7255, green: 0.7451, blue: 0.7608, opacity: 1),
        text: Color(.sRGB, red: 0.0431, green: 0.0471, blue: 0.0510, opacity: 1),
        textMuted: Color(.sRGB, red: 0.2941, green: 0.3137, blue: 0.3294, opacity: 1),
        textFaint: Color(.sRGB, red: 0.6902, green: 0.7098, blue: 0.7255, opacity: 1),
        accent: Color(.sRGB, red: 0.0314, green: 0.4392, blue: 0.1020, opacity: 1),
        accentBloom: Color(.sRGB, red: 0.0549, green: 0.7608, blue: 0.1412, opacity: 1),
        accentDim: Color(.sRGB, red: 0.7765, green: 0.9255, blue: 0.7882, opacity: 1),
        ok: Color(.sRGB, red: 0.0314, green: 0.4000, blue: 0.4235, opacity: 1),
        warn: Color(.sRGB, red: 0.4980, green: 0.3373, blue: 0.0431, opacity: 1),
        deny: Color(.sRGB, red: 0.6784, green: 0.1647, blue: 0.1373, opacity: 1),
        bypass: Color(.sRGB, red: 0.6902, green: 0.0235, blue: 0.3725, opacity: 1),
        glitchA: Color(.sRGB, red: 0.6902, green: 0.0235, blue: 0.3725, opacity: 1),
        glitchB: Color(.sRGB, red: 0.0314, green: 0.4000, blue: 0.4235, opacity: 1),
        onAccent: Color(.sRGB, red: 0.9490, green: 0.9569, blue: 0.9608, opacity: 1)
    )

    public enum Fonts {
        public static let wordmark = Font.custom("Doto", size: 34).weight(.black)
        public static let title = Font.system(size: 18, weight: .semibold)
        public static let body = Font.system(size: 13)
        public static let label = Font.system(size: 11)
        public static let mono = Font.system(size: 12, design: .monospaced)
    }

    public enum Space {
        public static let s1: CGFloat = 4
        public static let s2: CGFloat = 8
        public static let s3: CGFloat = 12
        public static let s4: CGFloat = 16
        public static let s5: CGFloat = 24
        public static let s6: CGFloat = 40
    }

    public enum Radius {
        public static let control: CGFloat = 4
        public static let panel: CGFloat = 8
        public static let pill: CGFloat = 999
    }

    public enum Status: String, CaseIterable {
        case idle, working, ok, warn, deny, bypass, crash

        public func color(_ theme: Theme) -> Color {
            switch self {
            case .idle: return theme.textFaint
            case .working: return theme.accent
            case .ok: return theme.ok
            case .warn: return theme.warn
            case .deny: return theme.deny
            case .bypass: return theme.bypass
            case .crash: return theme.bypass
            }
        }

        public var kaomoji: String {
            switch self {
            case .idle: return "(｡◕‿↼)"
            case .working: return "(¬‿¬)"
            case .ok: return "(｡◕‿↼)"
            case .warn: return "(¬_¬)"
            case .deny: return ">:["
            case .bypass: return ">:D"
            case .crash: return "XX"
            }
        }
    }
}
