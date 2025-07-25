// scripts/setupDirectories.js
const fs = require('fs').promises;
const path = require('path');

async function setupDirectories() {
  console.log('Setting up upload directories...');
  
  const baseDir = path.join(__dirname, '..', 'uploads');
  
  const directories = [
    baseDir,
    path.join(baseDir, 'Candidate'),
    path.join(baseDir, 'Client'),
    path.join(baseDir, 'Requirement'),
    path.join(baseDir, 'BGVVendor'),
    path.join(baseDir, 'Agency'),
    path.join(baseDir, 'User'),
    path.join(baseDir, 'temp')
  ];
  
  for (const dir of directories) {
    try {
      await fs.access(dir);
      console.log(`✓ Directory exists: ${dir}`);
    } catch {
      await fs.mkdir(dir, { recursive: true });
      console.log(`✓ Created directory: ${dir}`);
    }
  }
  
  // Create .gitignore in uploads directory
  const gitignorePath = path.join(baseDir, '.gitignore');
  const gitignoreContent = `# Ignore all files in this directory
*
# Except this file
!.gitignore`;
  
  try {
    await fs.writeFile(gitignorePath, gitignoreContent);
    console.log('✓ Created .gitignore in uploads directory');
  } catch (error) {
    console.error('Error creating .gitignore:', error);
  }
  
  console.log('\nDirectory setup complete!');
}

setupDirectories().catch(console.error);