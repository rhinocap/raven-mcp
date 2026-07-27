import SwiftUI

/// Tiny sample screen whose accessibility identifiers match
/// `mobile-grab/fixtures/sample-ax.json` for Path A M0.
struct ContentView: View {
    var body: some View {
        ZStack {
            Color(red: 0.055, green: 0.055, blue: 0.078)
                .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                Text("Raven")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(Color(red: 0.941, green: 0.941, blue: 0.949))
                    .accessibilityIdentifier("home.header")
                    .padding(.top, 24)

                Text("Design intelligence for your app screen")
                    .font(.system(size: 15))
                    .foregroundStyle(Color(red: 0.58, green: 0.596, blue: 0.627))
                    .accessibilityIdentifier("home.subtitle")
                    .padding(.top, 12)

                VStack(alignment: .leading, spacing: 12) {
                    Text("Primary action")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color(red: 0.941, green: 0.941, blue: 0.949))
                        .accessibilityIdentifier("home.card.title")

                    Text("Grab selects this card or its children via the accessibility tree.")
                        .font(.system(size: 14))
                        .foregroundStyle(Color(red: 0.58, green: 0.596, blue: 0.627))
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("home.card.body")
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(red: 0.129, green: 0.129, blue: 0.161))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("home.card")
                .padding(.top, 32)

                Button(action: {}) {
                    Text("Continue")
                        .font(.system(size: 16, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 52)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color(red: 0.039, green: 0.039, blue: 0.071))
                .background(Color(red: 0, green: 0.749, blue: 1))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .accessibilityIdentifier("home.continue")
                .padding(.top, 36)

                Button(action: {}) {
                    Text("Secondary")
                        .font(.system(size: 16, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 52)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color(red: 0, green: 0.749, blue: 1))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color(red: 0, green: 0.749, blue: 1).opacity(0.35), lineWidth: 1.5)
                )
                .accessibilityIdentifier("home.secondary")
                .padding(.top, 16)

                Spacer()
            }
            .padding(.horizontal, 24)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("app.root")
        }
    }
}

#Preview {
    ContentView()
}
