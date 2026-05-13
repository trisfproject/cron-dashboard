import clsx from 'clsx';

const variants = {
  default: {
    wrapper: 'h-11 justify-center lg:justify-start',
    image: 'h-10 max-w-[150px] sm:max-w-[165px] lg:max-w-[175px]'
  },
  navbar: {
    wrapper: 'h-11 w-[min(10rem,calc(100vw-5.75rem))] justify-start sm:w-[11rem] md:w-[7rem] lg:h-12 lg:w-[13rem]',
    image: 'h-auto max-h-10 w-full object-left sm:max-h-11 md:max-h-9 lg:max-h-12'
  },
  login: {
    wrapper: 'h-12 justify-start min-[360px]:h-14 sm:h-[3.25rem] md:h-14 lg:h-16',
    image: 'h-11 max-w-[155px] min-[360px]:h-12 min-[360px]:max-w-[180px] sm:h-12 sm:max-w-[195px] md:h-14 md:max-w-[220px] lg:h-16 lg:max-w-[250px]'
  }
};

export function BrandMark({ variant = 'default', className = '' }) {
  const styles = variants[variant] || variants.default;

  return (
    <span className={clsx('flex min-w-0 items-center', styles.wrapper, className)}>
      <img
        src="/branding/nyx-light.svg"
        alt="NYX Monitoring Platform"
        width="400"
        height="128"
        decoding="async"
        className={clsx('block object-contain dark:hidden', styles.image)}
      />
      <img
        src="/branding/nyx-dark.svg"
        alt="NYX Monitoring Platform"
        width="400"
        height="128"
        decoding="async"
        className={clsx('hidden object-contain dark:block', styles.image)}
      />
    </span>
  );
}
