/**
 * Time range filtering utilities for cron log analytics
 * Supports: today, 7d, 30d, quarter (90d), year (365d), custom
 */

/**
 * Build SQL WHERE clause for date range filtering
 * @param {string} range - Range type: 'today', '7d', '30d', 'quarter', 'year'
 * @returns {string} SQL WHERE clause fragment
 */
export function buildDateWhereClause(range = '7d') {
  const validRanges = {
    'today': 'INTERVAL 1 DAY',
    '7d': 'INTERVAL 7 DAY',
    '30d': 'INTERVAL 30 DAY',
    'quarter': 'INTERVAL 90 DAY',
    'year': 'INTERVAL 365 DAY'
  };

  const interval = validRanges[range] || validRanges['7d'];
  return `timestamp >= DATE_SUB(UTC_TIMESTAMP(), ${interval})`;
}

/**
 * Get the grouping format for timeline aggregation based on range
 * @param {string} range - Range type
 * @returns {string} MySQL DATE_FORMAT pattern
 */
export function getTimelineGroupFormat(range = '7d') {
  // Today & 7D: group by hour
  if (range === 'today' || range === '7d') {
    return '%Y-%m-%d %H:00:00';
  }

  // 30D, Quarter: group by day
  if (range === '30d' || range === 'quarter') {
    return '%Y-%m-%d';
  }

  // Year: group by month
  if (range === 'year') {
    return '%Y-%m-01';
  }

  // Default: daily
  return '%Y-%m-%d';
}

/**
 * Get human-readable description for a range
 * @param {string} range - Range type
 * @returns {string} Description
 */
export function getRangeDescription(range = '7d') {
  const descriptions = {
    'today': 'Today',
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    'quarter': 'Last 90 days (Quarter)',
    'year': 'Last 365 days (Year)'
  };

  return descriptions[range] || descriptions['7d'];
}

/**
 * Validate if a range is supported
 * @param {string} range - Range to validate
 * @returns {boolean} True if range is supported
 */
export function isValidRange(range) {
  return ['today', '7d', '30d', 'quarter', 'year'].includes(range);
}

/**
 * Get default range for new users or if invalid range provided
 * @returns {string} Default range ('7d')
 */
export function getDefaultRange() {
  return '7d';
}
