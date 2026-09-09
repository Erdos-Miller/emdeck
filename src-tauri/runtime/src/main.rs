fn main() {
    if let Err(error) = emdeck_session::cli::run(std::env::args().skip(1).collect(), false) {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
