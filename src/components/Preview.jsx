const Preview = ({ markdown }) => {
  return (
    <div className="preview">
      <h3>Preview</h3>
      <div
        className="markdown-preview ck-content"
        dangerouslySetInnerHTML={{ __html: markdown }}
      />
    </div>
  );
};

export default Preview;
