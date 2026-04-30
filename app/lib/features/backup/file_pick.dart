import 'dart:io';

import 'package:file_picker/file_picker.dart';

class JsonPicker {
  const JsonPicker._();

  Future<String?> pickJson() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['json'],
    );
    final path = result?.files.single.path;
    if (path == null) return null;
    return File(path).readAsString();
  }
}

const JsonPicker jsonPicker = JsonPicker._();
