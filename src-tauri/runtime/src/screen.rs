#[derive(Default)]
pub struct Replies {
    pub bytes: Vec<u8>,
    pub title: Option<String>,
}
impl vt100::Callbacks for Replies {
    fn set_window_title(&mut self, _: &mut vt100::Screen, title: &[u8]) {
        let title: String = String::from_utf8_lossy(title)
            .chars()
            .filter(|c| !c.is_control())
            .take(200)
            .collect();
        self.title = Some(title.trim().into());
    }
    fn unhandled_csi(
        &mut self,
        screen: &mut vt100::Screen,
        i1: Option<u8>,
        _: Option<u8>,
        params: &[&[u16]],
        c: char,
    ) {
        let first = params.first().and_then(|p| p.first()).copied().unwrap_or(0);
        let response = match (i1, c, first) {
            (None, 'n', 6) => {
                let (row, col) = screen.cursor_position();
                format!("\x1b[{};{}R", row + 1, col + 1)
            }
            (None, 'n', 5) => "\x1b[0n".into(),
            (None, 'c', _) => "\x1b[?1;2c".into(),
            (Some(b'>'), 'c', _) => "\x1b[>0;1;0c".into(),
            (None, 't', 18) => {
                let (rows, cols) = screen.size();
                format!("\x1b[8;{rows};{cols}t")
            }
            _ => return,
        };
        if self.bytes.len() < 8192 {
            self.bytes.extend(response.as_bytes());
        }
    }
}

pub fn replay(parser: &vt100::Parser<Replies>) -> Vec<u8> {
    // Restore the application buffer before painting its current state. The
    // parser also restores cursor, attributes, mouse and bracketed-paste modes.
    let mut bytes = b"\x1bc".to_vec();
    if parser.screen().alternate_screen() {
        bytes.extend(b"\x1b[?1049h");
    }
    bytes.extend(parser.screen().state_formatted());
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tracks_split_osc_titles_and_bounds_them() {
        let mut parser = vt100::Parser::new_with_callbacks(24, 80, 0, Replies::default());
        parser.process(b"\x1b]2;Fix login");
        assert!(parser.callbacks_mut().title.is_none());
        parser.process(b" flow\x07");
        assert_eq!(
            parser.callbacks_mut().title.as_deref(),
            Some("Fix login flow")
        );
        parser.process(b"\x1b]0;Next task\x1b\\");
        assert_eq!(parser.callbacks_mut().title.as_deref(), Some("Next task"));
        parser.process(b"\x1b]1;Icon only\x07");
        assert_eq!(parser.callbacks_mut().title.as_deref(), Some("Next task"));
        parser.process(format!("\x1b]2;{}\x07", "🚀".repeat(300)).as_bytes());
        assert_eq!(
            parser
                .callbacks_mut()
                .title
                .as_ref()
                .unwrap()
                .chars()
                .count(),
            200
        );
        parser.process(b"\x1b]2;\x07");
        assert_eq!(parser.callbacks_mut().title.as_deref(), Some(""));
    }
    #[test]
    fn answers_device_queries_without_a_renderer_and_replays_alternate_screen() {
        let mut parser = vt100::Parser::new_with_callbacks(24, 80, 200, Replies::default());
        parser.process(b"\x1b[4;6H\x1b[6n\x1b[5n\x1b[c\x1b[18t");
        assert_eq!(
            parser.callbacks_mut().bytes,
            b"\x1b[4;6R\x1b[0n\x1b[?1;2c\x1b[8;24;80t"
        );
        parser.process(b"\x1b[?1049h\x1b[?2004hretained agent");
        let mut restored = vt100::Parser::new(24, 80, 200);
        restored.process(&replay(&parser));
        assert_eq!(restored.screen().contents(), parser.screen().contents());
        assert!(restored.screen().alternate_screen());
        assert!(restored.screen().bracketed_paste());
    }
}
