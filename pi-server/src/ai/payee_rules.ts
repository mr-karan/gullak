/// Built-in fuzzy payee → category fallback. Used by every pipeline
/// (Quick Entry, SMS, WhatsApp) as a deterministic last-resort once the
/// LLM and the user-specific learned payee map both come up empty.
///
/// The match is case-insensitive substring against the payee name —
/// "Uber" matches "uber", "UBER INDIA SYSTEMS PVT LTD", "Uber Trip on
/// 06-May", etc. Curated for the Indian market. If a category name
/// returned from here doesn't exist in the user's category list, the
/// caller's name-matching will leave the field null and the user
/// chooses in the app.

const _rules: ReadonlyArray<{ patterns: RegExp[]; category: string }> = [
  // Groceries
  {
    patterns: [
      /\bblinkit\b/i,
      /\bbigbasket\b/i,
      /\bzepto\b/i,
      /\bdmart\b/i,
      /\bd-mart\b/i,
      /\binstamart\b/i,
      /\bnature.?s?\s+basket\b/i,
      /\bfreshtohome\b/i,
      /\blicious\b/i,
      /\bmore\s+supermarket\b/i,
      /\bspar\b/i,
      /\breliance\s+fresh\b/i,
      /\bsupermarket\b/i,
      /\bgrocer/i,
      /\bkirana\b/i,
    ],
    category: "Groceries",
  },
  // Eating out
  {
    patterns: [
      /\bzomato\b/i,
      /\bswiggy\b/i,
      /\beatsure\b/i,
      /\bdomino/i,
      /\bmcdonald/i,
      /\bbiryan/i,
      /\bsubway\b/i,
      /\bkfc\b/i,
      /\bburger\s*king\b/i,
      /\bstarbucks\b/i,
      /\bccd\b/i,
      /\bbarbeque\s*nation\b/i,
      /\bbbq\b/i,
      /\brestaurant\b/i,
      /\bdhaba\b/i,
      /\bcafe\b/i,
      /\bcoffee\b/i,
      /\bpizza\b/i,
      /\beating\s*out\b/i,
      /\bfood\s*court\b/i,
    ],
    category: "Eating Out",
  },
  // Transport / Fuel
  {
    patterns: [
      /\buber\b/i,
      /\bola\s*(?:cabs|auto)?\b/i,
      /\brapido\b/i,
      /\bnamma\s*yatri\b/i,
      /\bindrive\b/i,
      /\bmetro\b/i,
      /\bdmrc\b/i,
      /\bbmrc\b/i,
      /\bksrtc\b/i,
      /\bredbus\b/i,
      /\babhibus\b/i,
      /\birctc\b/i,
      /\brailway\b/i,
      /\btoll\b/i,
      /\bfastag\b/i,
      /\bparking\b/i,
    ],
    category: "Transport",
  },
  {
    patterns: [
      /\bindian\s*oil\b/i,
      /\bhpcl\b/i,
      /\bbpcl\b/i,
      /\biocl\b/i,
      /\bshell\b/i,
      /\bpetrol\b/i,
      /\bdiesel\b/i,
      /\bfuel\b/i,
      /\bbharat\s*petroleum\b/i,
      /\bhindustan\s*petroleum\b/i,
    ],
    category: "Fuel",
  },
  // Shopping
  {
    patterns: [
      /\bamazon\b/i,
      /\bflipkart\b/i,
      /\bmyntra\b/i,
      /\bajio\b/i,
      /\bnykaa\b/i,
      /\bmeesho\b/i,
      /\bsnapdeal\b/i,
      /\btatacliq\b/i,
      /\bcroma\b/i,
      /\breliance\s*digital\b/i,
      /\bdecathlon\b/i,
      /\bikea\b/i,
      /\blifestyle\b/i,
      /\bpantaloons\b/i,
      /\bmax\s*fashion\b/i,
      /\bzara\b/i,
      /\bh\s*&\s*m\b/i,
      /\buniqlo\b/i,
      /\bcolumbia\b/i,
      /\basics\b/i,
      /\bnike\b/i,
      /\badidas\b/i,
      /\bpuma\b/i,
    ],
    category: "Shopping",
  },
  // Family — kids
  {
    patterns: [
      /\bfirst\s*cry\b/i,
      /\bfirstcry\b/i,
      /\bhamleys\b/i,
      /\bmothercare\b/i,
    ],
    category: "Family",
  },
  // Entertainment
  {
    patterns: [
      /\bnetflix\b/i,
      /\bspotify\b/i,
      /\bprime\s*video\b/i,
      /\bamazon\s*prime\b/i,
      /\bhotstar\b/i,
      /\bdisney\+/i,
      /\bjio\s*cinema\b/i,
      /\bsonyliv\b/i,
      /\byoutube\s*premium\b/i,
      /\bbookmyshow\b/i,
      /\bpvr\b/i,
      /\binox\b/i,
      /\bmovie\b/i,
      /\bcinema\b/i,
    ],
    category: "Entertainment",
  },
  // Health
  {
    patterns: [
      /\bapollo\s*pharmacy\b/i,
      /\b1mg\b/i,
      /\bnetmeds\b/i,
      /\bpharmeasy\b/i,
      /\bmedplus\b/i,
      /\bzeneris\b/i,
      /\bpharma\b/i,
      /\bclinic\b/i,
      /\bhospital\b/i,
      /\bdoctor\b/i,
      /\bdental\b/i,
      /\boptical\b/i,
      /\blenskart\b/i,
      /\bcure\.fit\b/i,
      /\bcult\.fit\b/i,
      /\bgym\b/i,
    ],
    category: "Health",
  },
  // Phone / Internet
  {
    patterns: [
      /\bairtel\b/i,
      /\bjio\b/i,
      /\bvi\b/i,
      /\bvodafone\b/i,
      /\bbsnl\b/i,
      /\bact\s*fibernet\b/i,
      /\bact\s*broadband\b/i,
      /\bexcitel\b/i,
      /\bhathway\b/i,
      /\btikona\b/i,
    ],
    category: "Phone & Internet",
  },
  // Utilities
  {
    patterns: [
      /\bbescom\b/i,
      /\bmsedcl\b/i,
      /\btata\s*power\b/i,
      /\badani\s*electricity\b/i,
      /\bbses\b/i,
      /\belectricity\b/i,
      /\bwater\s*bill\b/i,
      /\bgas\s*bill\b/i,
      /\bigl\b/i,
    ],
    category: "Utilities",
  },
  // Travel — flights / hotels
  {
    patterns: [
      /\bmakemytrip\b/i,
      /\bmmt\b/i,
      /\bgoibibo\b/i,
      /\beasemytrip\b/i,
      /\bcleartrip\b/i,
      /\byatra\b/i,
      /\bairbnb\b/i,
      /\boyo\b/i,
      /\btreebo\b/i,
      /\bbooking\.com\b/i,
      /\bagoda\b/i,
      /\bindigo\b/i,
      /\bairindia\b/i,
      /\bvistara\b/i,
      /\bspicejet\b/i,
      /\bakasa\s*air\b/i,
    ],
    category: "Travel",
  },
  // Income / salary
  {
    patterns: [
      /\bsalary\b/i,
      /\binterest\b/i,
      /\bdividend\b/i,
      /\bcashback\b/i,
      /\brefund\b/i,
    ],
    category: "Income",
  },
];

/// Returns a curated category name when [payee] matches one of the
/// built-in merchant rules, else null. Caller resolves the name against
/// the user's category list — a returned "Eating Out" will only land if
/// the user actually has that category.
export function staticCategoryForPayee(payee: unknown): string | null {
  if (typeof payee !== "string") return null;
  const text = payee.trim();
  if (!text) return null;
  for (const rule of _rules) {
    if (rule.patterns.some((re) => re.test(text))) return rule.category;
  }
  return null;
}
