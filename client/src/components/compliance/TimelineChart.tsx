import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TimelineDataPoint } from '@/types/compliance-timeline';

interface TimelineChartProps {
  data: TimelineDataPoint[];
}

interface ChartDataPoint {
  date: string;
  formattedDate: string;
  [key: string]: number | string;
}

// Generate distinct colors for products
const PRODUCT_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
];

export function TimelineChart({ data }: TimelineChartProps) {
  const [hiddenProducts, setHiddenProducts] = useState<Set<string>>(new Set());

  // Transform data for Recharts
  // Group by date and create one data point per date with all products
  const dateMap = new Map<string, ChartDataPoint>();
  const products = new Set<string>();

  data.forEach((point) => {
    products.add(point.product_name);

    if (!dateMap.has(point.date)) {
      dateMap.set(point.date, {
        date: point.date,
        formattedDate: new Date(point.date).toLocaleDateString('de-DE', {
          month: 'short',
          year: '2-digit',
        }),
      });
    }

    const entry = dateMap.get(point.date)!;
    entry[point.product_name] = point.compliance_rate;
  });

  const chartData = Array.from(dateMap.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const productArray = Array.from(products);
  const visibleProducts = productArray.filter(p => !hiddenProducts.has(p));

  const toggleProduct = (product: string) => {
    setHiddenProducts(prev => {
      const next = new Set(prev);
      if (next.has(product)) {
        next.delete(product);
      } else {
        next.add(product);
      }
      return next;
    });
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium text-slate-900 mb-2">
            {new Date(label).toLocaleDateString('de-DE', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
          </p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-slate-600">{entry.dataKey}:</span>
              <span className="font-medium text-slate-900">{entry.value}%</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  if (chartData.length < 2) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500">
        Mindestens 2 Datenpunkte erforderlich für die Visualisierung
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {productArray.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {productArray.map((product, index) => {
            const color = PRODUCT_COLORS[index % PRODUCT_COLORS.length];
            const isHidden = hiddenProducts.has(product);
            return (
              <button
                key={product}
                type="button"
                onClick={() => toggleProduct(product)}
                aria-pressed={!isHidden}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border transition-all ${
                  isHidden
                    ? 'bg-slate-100 text-slate-400 border-slate-200'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: isHidden ? '#d1d5db' : color }}
                />
                {product}
              </button>
            );
          })}
        </div>
      )}

      <div className="h-80">
        {visibleProducts.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500">
            Bitte mindestens ein Produkt auswählen
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="formattedDate"
                tick={{ fill: '#6b7280', fontSize: 12 }}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={{ stroke: '#e5e7eb' }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#6b7280', fontSize: 12 }}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={{ stroke: '#e5e7eb' }}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              {visibleProducts.map((product) => {
                const index = productArray.indexOf(product);
                const color = PRODUCT_COLORS[index % PRODUCT_COLORS.length];
                return (
                  <Line
                    key={product}
                    type="monotone"
                    dataKey={product}
                    stroke={color}
                    strokeWidth={2}
                    dot={{ r: 4, fill: color }}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
