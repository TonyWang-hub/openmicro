# OpenMicro

A new Flutter project.

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Lab: Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Cookbook: Useful Flutter samples](https://docs.flutter.dev/cookbook)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.

## Testing

Run the standard test suite (what CI runs):

```
flutter test --exclude-tags golden
```

`test/device_golden_test.dart` holds screenshot (golden) regression tests for
`DeviceKeyboard`. They're a local visual-regression tool, not part of CI —
macOS/Linux font/anti-aliasing differences make pixel comparisons unreliable
across platforms. After an intentional style change to the keyboard, refresh
the baselines locally:

```
flutter test --update-goldens --tags golden
```
