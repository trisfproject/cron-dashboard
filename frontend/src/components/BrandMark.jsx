import clsx from 'clsx';

const variants = {
  default: {
    wrapper: 'h-10 justify-center lg:h-10 lg:justify-start',
    image: 'h-9 max-w-[150px] sm:max-w-[165px] lg:h-9 lg:max-w-[170px]'
  },
  login: {
    wrapper: 'h-12 justify-start min-[360px]:h-14 sm:h-12 sm:justify-center lg:h-12',
    image: 'h-10 max-w-[150px] min-[360px]:h-12 min-[360px]:max-w-[180px] sm:h-10 sm:max-w-[172px] lg:h-10'
  }
};

export function BrandMark({ variant = 'default', className = '' }) {
  const styles = variants[variant] || variants.default;

  return (
    <span className={clsx('flex min-w-0 items-center', styles.wrapper, className)}>
      <img
        src="/branding/nyx-light.svg"
        alt="NYX Cron Dashboard"
        width="150"
        height="40"
        className={clsx('block w-auto object-contain dark:hidden', styles.image)}
      />
      <img
        src="/branding/nyx-dark.svg"
        alt="NYX Cron Dashboard"
        width="150"
        height="40"
        className={clsx('hidden w-auto object-contain dark:block', styles.image)}
      />
    </span>
  );
}
