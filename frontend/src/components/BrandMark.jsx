export function BrandMark() {
  return (
    <span className="flex h-10 items-center justify-center lg:h-10 lg:justify-start">
      <img
        src="/branding/nyx-light.svg"
        alt="NYX Cron Dashboard"
        width="150"
        height="40"
        className="block h-9 w-auto max-w-[150px] object-contain dark:hidden sm:max-w-[165px] lg:h-9 lg:max-w-[170px]"
      />
      <img
        src="/branding/nyx-dark.svg"
        alt="NYX Cron Dashboard"
        width="150"
        height="40"
        className="hidden h-9 w-auto max-w-[150px] object-contain dark:block sm:max-w-[165px] lg:h-9 lg:max-w-[170px]"
      />
    </span>
  );
}
