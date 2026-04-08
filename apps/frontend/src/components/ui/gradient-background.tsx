import styles from "./gradient-background.module.css";

interface GradientBackgroundProps {
  opacity?: number;
  className?: string;
}

export function GradientBackground({
  opacity = 1,
  className,
}: GradientBackgroundProps) {
  return (
    <div
      className={`${styles.gradient} ${className ?? ""}`}
      style={{ opacity }}
    />
  );
}
