/**
 * PR-FE-05: Settings page loading skeleton
 * AC-07: shown while GET /merchants/me is pending
 */
export default function SettingsLoading() {
  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto animate-pulse">
      {/* Header */}
      <div className="h-8 w-48 bg-gray-200 rounded mb-6" />

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 w-24 bg-gray-200 rounded-md" />
        ))}
      </div>

      {/* Card skeleton */}
      <div className="border border-gray-200 rounded-xl p-6 space-y-4 bg-white">
        <div className="h-6 w-40 bg-gray-200 rounded" />
        <div className="h-4 w-64 bg-gray-100 rounded" />
        <div className="space-y-3 mt-4">
          <div className="h-4 w-28 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-100 rounded" />
        </div>
        <div className="space-y-3">
          <div className="h-4 w-28 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-100 rounded" />
        </div>
        <div className="h-9 w-32 bg-gray-200 rounded mt-4" />
      </div>
    </div>
  );
}
