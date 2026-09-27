# Tabular Results Feature

## Overview
The Text Harvester provides comprehensive results display and export functionality with enhanced table features, sorting, and data management capabilities.

## Features

### **Results Display**
- **Sortable Columns**: Click column headers to sort by memorial number, name, year of death, source type, AI model, and processing date
- **Expandable Rows**: Click any row to view detailed information
- **Source Type Badges**: Visual indicators for Record Sheet vs Monument Photo processing
- **Model Information**: Display AI provider, model version, and processing details

### **Data Management**
- **Filter by Source Type**: Separate views for different processing modes
- **Search and Filter**: Find specific records quickly
- **Bulk Operations**: Select multiple records for batch operations
- **Real-time Updates**: Live updates during processing

### **Export Functionality**
- **CSV Export**: Download results in CSV format with custom filenames
- **JSON Export**: Download results in JSON format for data integration
- **Custom Filenames**: User-defined export filenames
- **Complete Data**: All fields including metadata and processing information

### **User Experience**
- **Responsive Design**: Works on desktop and mobile devices
- **Loading States**: Clear progress indicators during processing
- **Error Handling**: User-friendly error messages and recovery options
- **Accessibility**: Keyboard navigation and screen reader support

## Technical Implementation

### **Frontend Components**
- `public/js/modules/results/main.js` - Main results display logic
- `public/js/modules/results/tableEnhancements.js` - Table functionality
- `public/js/modules/results/download.js` - Export functionality
- `public/results.html` - Results page template

### **Backend Support**
- `src/controllers/resultsManager.js` - Results data management
- `src/routes/progressRoutes.js` - Progress tracking
- Database queries optimized for sorting and filtering

### **Data Structure**
- **Memorial Records**: Complete memorial data with metadata
- **Source Type Tracking**: Record Sheet vs Monument Photo processing
- **Model Information**: AI provider and version tracking
- **Processing Metadata**: Timestamps, file information, and validation status

## Usage

1. **View Results**: Navigate to the results page after processing
2. **Sort Data**: Click column headers to sort by different criteria
3. **View Details**: Click any row to expand and see full details
4. **Export Data**: Use the download buttons to export in your preferred format
5. **Filter Results**: Use the source type filter to view specific processing modes

## Best Practices

- **Regular Exports**: Export data regularly for backup purposes
- **Use Sorting**: Sort by processing date to see latest results first
- **Check Details**: Use row expansion to verify data accuracy
- **Monitor Processing**: Watch for any processing errors or warnings

---

*This feature is fully implemented and production-ready.*
