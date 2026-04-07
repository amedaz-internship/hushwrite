import DOMPurify from "dompurify";

const Preview = ({ markdown }) => {
  const cleanHTML = DOMPurify.sanitize(markdown);

  return (
    <div className="preview">
      <h3>Preview</h3>
      <div
        className="markdown-preview ck-content"
        dangerouslySetInnerHTML={{ __html: cleanHTML }}
      />
    </div>
  );
};

export default Preview;
