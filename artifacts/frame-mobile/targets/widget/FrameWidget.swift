// UNVERIFIED: written without Xcode. Reads the JSON the app writes via lib/widgetBridge.ts.
import WidgetKit
import SwiftUI

private let appGroup = "group.app.replit.frame"
private let storageKey = "frame.widget.v1"

struct Payload: Decodable {
  let focusTitle: String
  let focusDetail: String
  let daysLeft: Int?
  let campName: String?
  let daysCaption: String
}

struct Entry: TimelineEntry {
  let date: Date
  let payload: Payload?
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry {
    Entry(date: Date(), payload: Payload(focusTitle: "Today's focus", focusDetail: "", daysLeft: 14, campName: nil, daysCaption: "days left in camp"))
  }
  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(load()) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date().addingTimeInterval(3600)
    completion(Timeline(entries: [load()], policy: .after(next)))
  }
  private func load() -> Entry {
    guard let json = UserDefaults(suiteName: appGroup)?.string(forKey: storageKey),
          let data = json.data(using: .utf8),
          let p = try? JSONDecoder().decode(Payload.self, from: data) else { return Entry(date: Date(), payload: nil) }
    return Entry(date: Date(), payload: p)
  }
}

struct FrameWidgetView: View {
  let entry: Entry
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      if let p = entry.payload {
        Text(p.focusTitle).font(.headline).lineLimit(2)
        if let d = p.daysLeft {
          Text("\(d)").font(.system(size: 34, weight: .bold))
          Text(p.daysCaption).font(.caption)
        } else if !p.focusDetail.isEmpty {
          Text(p.focusDetail).font(.caption).lineLimit(3)
        }
      } else {
        Text("Open FRAME").font(.headline)
      }
    }.padding()
  }
}

@main
struct FrameWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "FrameWidget", provider: Provider()) { FrameWidgetView(entry: $0) }
      .configurationDisplayName("FRAME")
      .description("Today's focus and days left in camp.")
      .supportedFamilies([.systemSmall, .systemMedium])
  }
}
