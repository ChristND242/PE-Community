const operation = process.argv.slice(2).join(' ');
if (!['migrate deploy', 'migrate status'].includes(operation)) {
  console.error('Unsupported migration fixture operation.');
  process.exit(2);
}
await new Promise((resolve) => setTimeout(resolve, 750));
console.log(`Disposable migration fixture completed: ${operation}`);
