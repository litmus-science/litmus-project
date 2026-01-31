export const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export const formatUsdRange = (value: string) => {
  const numbers = value.match(/\d+(\.\d+)?/g)?.map((n) => Number(n)) ?? [];
  if (numbers.length === 0) return value;
  if (numbers.length === 1) return formatUsd(numbers[0]);
  return `${formatUsd(numbers[0])} - ${formatUsd(numbers[1])}`;
};
