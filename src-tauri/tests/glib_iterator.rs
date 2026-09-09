//! Regression for RUSTSEC-2024-0429. CI also runs this with optimization.
#![cfg(target_os = "linux")]

use glib::variant::ToVariant;

#[test]
fn string_iterator_preserves_forward_reverse_and_unicode_values() {
    let values = ["first", "", "Emdeck λ", "last"];
    let variant = values.to_variant();
    assert_eq!(
        variant.array_iter_str().unwrap().collect::<Vec<_>>(),
        values
    );
    assert_eq!(
        variant.array_iter_str().unwrap().rev().collect::<Vec<_>>(),
        values.into_iter().rev().collect::<Vec<_>>()
    );
    let mut mixed = variant.array_iter_str().unwrap();
    assert_eq!(mixed.next(), Some("first"));
    assert_eq!(mixed.next_back(), Some("last"));
    assert_eq!(mixed.nth(1), Some("Emdeck λ"));
    assert_eq!(mixed.next(), None);
    assert_eq!(mixed.next_back(), None);
}
