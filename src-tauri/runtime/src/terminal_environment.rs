use portable_pty::CommandBuilder;

/// A new Emdeck PTY has its own color capabilities, independent of its launcher.
/// Shell profiles and explicit commands can still opt out after the shell starts.
pub fn configure_terminal_environment(command: &mut CommandBuilder) {
    for key in [
        "NO_COLOR",
        "FORCE_COLOR",
        "CLICOLOR",
        "CLICOLOR_FORCE",
        "NODE_DISABLE_COLORS",
    ] {
        command.env_remove(key);
    }
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    command.env("TERM_PROGRAM", "Emdeck");
}
