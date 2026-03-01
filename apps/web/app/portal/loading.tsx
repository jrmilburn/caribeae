export default function PortalLoading() {
  return (
    <div className="space-y-8 animate-pulse" aria-live="polite" aria-busy="true">
      <section className="space-y-4">
        <div className="h-8 w-56 rounded bg-gray-200" />
        <div className="h-4 w-72 rounded bg-gray-200" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="overflow-hidden rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
              <div className="h-4 w-32 rounded bg-gray-200" />
              <div className="mt-4 h-8 w-24 rounded bg-gray-200" />
              <div className="mt-4 h-3 w-40 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="h-6 w-24 rounded bg-gray-200" />
        <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-200">
          <div className="h-16 border-b border-gray-200 px-6" />
          <div className="space-y-4 px-6 py-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-24 rounded-lg border border-gray-200 bg-gray-50" />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
