function nmpInspectBindingReadOnly() {
  const book = SpreadsheetApp.getActiveSpreadsheet();

  console.log(JSON.stringify({
    spreadsheetAvailable: Boolean(book),
    spreadsheetId: book ? book.getId() : null,
    hasSettings: Boolean(book && book.getSheetByName('Settings')),
    hasRequests: Boolean(book && book.getSheetByName('Requests')),
    hasJobs: Boolean(book && book.getSheetByName('Jobs'))
  }, null, 2));
}