This project consistes of 2 parts: one is an image server and the other is a web-based image editor. The image server is a command line tool that take a folder path as input. On startup, it walks the folder tree and creates a database of all image files: nifti files (*.nii or *.nii.) and dicom files (*., *.dcm, *.DCM). Note that dicom images will need to be combined with other dicom images with the SAME series_instance_uid value in order to create a 'volume' which is what is usually edited. This has 3 spatial dimensions (X, Y, and Z) with set spaciing between the center of each pixel that is the same along each dimension but may be different for different axes (e.g. Z spacing is often different from X spacing.) The server provides information to the editor webpage showing the properties of the volumes availbale: path and file name, X,Y,Z dimensions, and if the source is DICOM, the Study Description and Series description when the user clicks on an entry from the list, as well as the date of the file.
Technical design: Use Python for handling images and image processing and fastapi for web server. Use javascript for frontend with your choice of framework, recognizing that handling pixels well including handing off to python for image process is critical.
This project consistes of 2 parts: one is an image server and the other is a  web-based image editor. The image server is a command line tool that take a     
folder path as input. On startup, it walks the folder tree and creates a        
database of all image files: nifti files (*.nii or *.nii.) and dicom files (*., 
 *.dcm, *.DCM). Note that dicom images will need to be combined with other      
dicom images with the SAME series_instance_uid value in order to create a       
'volume' which is what is usually edited. This has 3 spatial dimensions (X, Y,  
and Z) with set spaciing between the center of each pixel that is the same      
along each dimension but may be different for different axes (e.g. Z spacing is 
 often different from X spacing.) The server provides information to the editor 
 webpage showing the properties of the volumes availbale: path and file name,   
X,Y,Z dimensions, and if the source is DICOM, the Study Description and Series  
description when the user clicks on an entry from the list, as well as the date 
 of the file.                                                                   
Technical design: Use Python for handling images and image processing and       
fastapi for web server. Use javascript for frontend with your choice of         
framework, recognizing that handling pixels well including handing off to       
python for image process is critical.                                           
                                                                                
The web client corresponding to this should query the server part for the list  
of available series. given that list, the list should be shown in a listbox. If 
 the user click on one of those, addtional information like the DICOM Study     
Description and DICOM Series Description should be shown. If it is a nifti      
file, then only show the date of the file.  The user may then 'Open' the        
selected file. This is considered the "Main" image which are the pixel of the   
original imaging study. There may be an associated segmentation study which has 
 an image of the exact same dimensions, but with 1 byte per voxel of the Main   
image. That byte value reflects the 'label' for htat pixel. If a mask file      
exists, it will be the same basename as the nifti file but with _segmentation   
appended (eg. "MainImage_segmentation.nii.gz"). after opening the main image,   
create a popup dialog asking if there is a matching segmentation image, and if  
there is, open a file navigation widget to let the user select it. If a         
'matching' segmentation file is present, have that be selected so the user need 
 only click 'OK' to load it.                                                    
Once the main image and possible segmentation image is loaded, the central      
slice should be be shown as a 4-view: An axial image in the upper left, a       
coronal in the upper right, and a sagittal in the lower left. The initial slice 
 should be a the middle of the dimension (e.g. zdim/2 for axial, ydim/2 for     
coronal, xdim/2 for sagittal). THe lower left is left blank for now. Each of    
the 3 image views should have a slider bar on the right hand side that controls 
 which slice is shown. And just above the slider for each have a small button   
that is 'A' for Axial, 'C' for coronal, and 'S' for sagittal. Clicking one of   
these will make that image view fill the entire window. When in the single view 
 mode, havae a slider bar at the right for selecting hte slice number and have  
a '+' in a button, and clicking that will return to the original 4 view format. 
                                                                                
There should also be a tool panel on the left side with a light gray            
background.  When a segmentation mask is loaded, should the viewer show a color overlay on top of the main image? Do you want a label legend  (e.g., label 1 = "Tumor" in red, label 2 = "Liver" in green)?  DICOM series grouping — you mentioned combining DICOMs by series_instance_uid. The server should not handle multi-frame DICOMs, and should assemble the view data for the viewer on-demand when the user opens a series. The typical data will be 512x512x400.  it should show text for each label such as 'Tumor' but if the user double  
clicks the text they should be able to change it. Therefore, it should start as 
 'Label1', 'Label2', etc. Each label has an associated integer value, text name, and color that's also customizable. All three of these can be change if the user doubvle clicks on the item and then enters a new value. If they double click on the integer, existing mask pixels with that value will be changed to the new value.                                                              
 The browser should render the view(s) as required but the full volume     
should stay in the viewer. So the full volume lives in the browser's memory and the viewer renders slices client-side from that. That makes scrolling through slices fast. 
The server should just catalog the data as most often only 1 volume will be used out of a study and the viewer will only show the view of 1 volume plus the          
segmentation overlay. Tool Panel: Yes v1 should have basic tools like           
paintbrush, rectalngle and oval ROI, region grow. Eraser is right mouse button  
paintbrush                                                                      
                                                                                
⏺ Good — server catalogs metadata only, loads on demand. And solid set of v1    
  tools.                          
The paintbrush tool paints single slice but have a slider to paint n slices at a time. For the ROI tools (rectangle and oval), it draws them but if the user holds shift key down when drawing, it will instead calculate an otsu threshold of the pixel in the ROI, apply that to create a bitmask and set the pixels to the current object value which are 'on'. In this case 'on' means the bitmask value (0 or 1) that has fewest members that are on the outline of the ROI. 3. Yes 2D and there should be a min & max slider that defines the range of pixel values that can be added. Yes ctrl-V should allow up to 3 levels of undo. 5. It shoudl always do a 'Save As...' and if the user had already loaded a segmentaiton, that name should be suggested, else use the image name with _seg appended to the base name.  The region grow tool should be global and 'remember' previous values. It should grow from    
single click. Clicking 'OK' will mean the region grow is complete   2. the      
bottom left of the panel should have a dropdown with the labels that have been  
used (e.g. present in a loaded segmentation file). If none was loaded, then     
obviously 0 is always there as background but the there should be an 'add       
object' button which lets the use add a value tot he segmentation map. The      
lowest unused value is the default, but the user can over-ride this to choose   
what they want (e.g. they may wan 0 to be background and 255 to be the object). 
The overlay shown on slices should have user-selected transparency. The slider shoudl be 0-100 and be just below the object dropdown. 4. The 'Brain' 'Bone' 'Lung' and  'Abd' should use preset values (0-80, -1000 to +2000, -1000 to 0, and -100 to  +350 respectively). but on startup, calculate the 5-95 percential histogram     
values and set those as the min and max display window values. If the user      
holds Control key down while draggging gthe left mouse, that shoudl adjust w/L: 
 dragging up makes the image brighter (lower center level), dragging down makes 
 it darker, dragging right makes it wider (less contrast) and dragging left     
makes it more constrast. 

