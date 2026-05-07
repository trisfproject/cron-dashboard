export function BrandMark() {
  return (
    <span className="flex h-9 items-center sm:h-10">
      <img
        src="/branding/nyx-light.svg"
        alt="NYX Cron Dashboard"
        width="150"
        height="40"
        className="block h-7 w-auto max-w-[132px] object-contain dark:hidden sm:h-9 sm:max-w-[170px]"
      />
      <img
        src="/branding/nyx-dark.svg"
        alt="NYX Cron Dashboard"
        width="150"
        height="40"
        className="hidden h-7 w-auto max-w-[132px] object-contain dark:block sm:h-9 sm:max-w-[170px]"
      />
    </span>
  );
}
