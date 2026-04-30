import 'parsers/axis_parser.dart';
import 'parsers/hdfc_parser.dart';
import 'parsers/icici_parser.dart';
import 'parsers/parser.dart';
import 'parsers/sbi_parser.dart';
import 'sms_models.dart';

class ParserRegistry {
  ParserRegistry._();

  static final List<SmsParser> all = <SmsParser>[
    HdfcCardParser(),
    HdfcUpiParser(),
    IciciParser(),
    AxisParser(),
    SbiParser(),
  ];

  static SmsCandidate? tryParse(IncomingSms sms) {
    for (final parser in all) {
      if (parser.matches(sms)) {
        final cand = parser.parse(sms);
        if (cand != null) return cand;
      }
    }
    return null;
  }
}
