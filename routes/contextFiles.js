const express = require('express');
const router = express.Router({ mergeParams: true });
const ContextFile = require('../models/ContextFile');
const generateEmbedding = require('../utils/embedding');
const { isLoggedIn } = require('../middleware/auth');
const { isSuperAdmin } = require('../middleware/checkRoles');
const methodOverride = require('method-override');
const multer = require('multer');
const mammoth = require('mammoth');
const upload = multer({ dest: 'uploads/' }); // or configure storage if needed
const fs = require('fs').promises;

//SHOW ALL CONTEXT
router.get('/', isLoggedIn, isSuperAdmin, async (req, res) => {
  const files = await ContextFile.find({ organization: req.user.organization }).sort({ createdAt: -1 });
  res.render('contextFiles/index', {
    files,
    orgName: req.params.orgName,
    title: 'Context Files',
  });
});

//SHOW FORM FOR CONTEXT FILE
router.get('/new', isLoggedIn, isSuperAdmin, (req, res) => {
  res.render('contextFiles/new', { orgName: req.params.orgName, title: 'Upload Context File' });
});

//CREATE NEW CONTEXT
router.post('/', isLoggedIn, isSuperAdmin, upload.single('docxFile'), async (req, res) => {
  const { title, description, content } = req.body;
  let finalContent = content;

  try {
    if (req.file) {
      const result = await mammoth.extractRawText({ path: req.file.path });
      finalContent = result.value.trim();
      await fs.unlink(req.file.path); // cleanup
    }

    if (!finalContent) {
      req.flash('error', 'No content provided or extracted');
      return res.redirect('back');
    }

    const embedding = await generateEmbedding(finalContent);

    const contextFile = new ContextFile({
      title,
      description,
      content: finalContent,
      embedding,
      createdBy: req.user._id,
      organization: req.user.organization
    });

    await contextFile.save();
    req.flash('success', 'Context file uploaded successfully');
    res.redirect(`/${req.params.orgName}/context-files`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to upload context');
    res.redirect('back');
  }
});


// EDIT FORM
router.get('/:id/edit', isLoggedIn, isSuperAdmin, async (req, res) => {
  const file = await ContextFile.findById(req.params.id);
  if (!file) {
    req.flash('error', 'Context file not found');
    return res.redirect(`/${req.params.orgName}/context-files`);
  }
  res.render('contextFiles/edit', { file, orgName: req.params.orgName, title: 'Edit Context File' });
});

// UPDATE LOGIC
router.put('/:id', isLoggedIn, isSuperAdmin, async (req, res) => {
  const { title, description, content } = req.body;
  try {
    const embedding = await generateEmbedding(content); // re-embed on content change
    await ContextFile.findByIdAndUpdate(req.params.id, {
      title, description, content, embedding
    });
    req.flash('success', 'Context file updated successfully');
    res.redirect(`/${req.params.orgName}/context-files`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to update context');
    res.redirect('back');
  }
});

// DELETE CONTEXT FILE
router.delete('/:id', isLoggedIn, isSuperAdmin, async (req, res) => {
  try {
    await ContextFile.findByIdAndDelete(req.params.id);
    req.flash('success', 'Context file deleted successfully');
    res.redirect(`/${req.params.orgName}/context-files`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to delete context file');
    res.redirect('back');
  }
});

//VIEW ONE CONTEXT
router.get('/:id', isLoggedIn, isSuperAdmin, async (req, res) => {
  const file = await ContextFile.findById(req.params.id);
  if (!file) {
    req.flash('error', 'Context file not found');
    return res.redirect(`/${req.params.orgName}/context-files`);
  }
  res.render('contextFiles/show', {
    file,
    orgName: req.params.orgName,
    title: file.title,
  });
});

module.exports = router;
