export function BrandMark() {
  return (
    <span className="flex h-12 items-center justify-center md:h-10 md:justify-start">
      <img
        src="/branding/nyx-light.svg"
        alt="NYX Cron Dashboard"
        width="150"
        height="40"
        className="block h-11 w-auto max-w-[190px] object-contain dark:hidden sm:h-12 sm:max-w-[210px] md:h-9 md:max-w-[170px]"
      />
      <img
        src="/branding/nyx-dark.svg"
        alt="NYX Cron Dashboard"
        width="150"
        height="40"
        className="hidden h-11 w-auto max-w-[190px] object-contain dark:block sm:h-12 sm:max-w-[210px] md:h-9 md:max-w-[170px]"
      />
    </span>
  );
}
