import clsx from 'clsx';

const variants = {
  default: {
    wrapper: 'h-11 justify-center lg:justify-start',
    image: 'h-10 max-w-[150px] sm:max-w-[165px] lg:max-w-[175px]'
  },
  navbar: {
    wrapper: 'h-12 justify-start',
    image: 'h-11 max-w-[155px] sm:max-w-[175px] md:max-w-[190px] lg:h-12 lg:max-w-[210px]'
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
        className={clsx('block w-auto object-contain dark:hidden', styles.image)}
      />
      <img
        src="/branding/nyx-dark.svg"
        alt="NYX Monitoring Platform"
        width="400"
        height="128"
        decoding="async"
        className={clsx('hidden w-auto object-contain dark:block', styles.image)}
      />
    </span>
  );
}
